/**
 * Création d'un rapport à partir d'une source déjà préparée et vérifiée par le lecteur :
 * limites du compte, rapport et tâche de génération, écrits côté serveur pour l'utilisateur
 * authentifié. Idempotent par clé client.
 */
import "server-only";
import { z } from "zod";
import { Goal, Level, Mode, TargetPages, TemplateId, ThemeId, VisualMode } from "@/lib/contracts/schemas";
import { planPages } from "@/lib/engine/pipeline";
import { recordLimitEvent, REPORT_CREATED } from "@/lib/jobs/limits";
import { ACTION_PRICES, reportAction } from "@/lib/billing/catalog";
import { accountUsage, attachReservation, CreditError, getEntitlements, releaseReservation, reserveCredits } from "@/lib/billing/wallet";
import { PrepareError, PrepareText, PrepareUpload, PrepareUrl, prepareSource, type PrepareRequest } from "@/lib/sources/prepare";
import { MAX_SOURCES } from "@/lib/reports/source-set";
import { adminClient } from "@/lib/supabase/admin";
import { effectiveVisualMode } from "@/lib/visuals/config";

const Settings = {
  /** Approche choisie à l'import (V4) ; absente : dernier choix, sinon explication claire. */
  mode: Mode.optional(),
  /** Absents : déduits du mode, des préférences et de la taille du document. */
  level: Level.optional(),
  goal: Goal.optional(),
  target_pages: TargetPages.optional(),
  /** Organisation imposée par le lecteur ; absente = choisie par le rédacteur. */
  template: TemplateId.nullable().optional(),
  /** Présentation (modifiable ensuite sans appel IA) et visuels permis. */
  theme: ThemeId.optional(),
  visual_mode: VisualMode.optional(),
  idempotency_key: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
};

export const CreateRequest = z.union([
  z.strictObject({ source_id: z.string().uuid(), ...Settings }),
  // Limpid commun (V5) : plusieurs documents, dans l'ordre de lecture choisi.
  z.strictObject({ source_ids: z.array(z.string().uuid()).min(1).max(MAX_SOURCES), ...Settings }),
  // Compatibilité : préparation et création en un seul envoi (ancien formulaire).
  z.preprocess(
    (v) => (v && typeof v === "object" && !("source" in v) && "text" in v ? { ...v, source: "text" } : v),
    z.discriminatedUnion("source", [PrepareText.extend(Settings), PrepareUpload.extend(Settings), PrepareUrl.extend(Settings)]),
  ),
]);
export type CreateRequest = z.infer<typeof CreateRequest>;

export class CreateError extends Error {
  constructor(
    public readonly code:
      | "generation_disabled"
      | "extraction"
      | "upload_missing"
      | "url_disabled"
      | "url"
      | "storage"
      | "ocr_consent"
      | "limit"
      | "rate"
      | "source_missing"
      | "source_used"
      | "credits"
      | "weekly"
      | "plan_reports"
      | "plan_sources",
    message: string,
    /** Pages à lire par OCR (demande d'accord). */
    public readonly pages?: number,
    /** Rapport déjà créé pour cette source. */
    public readonly reportId?: string,
    /** Crédits manquants, limite atteinte : de quoi expliquer la limite exacte (§ 11). */
    public readonly detail: { needed?: number; available?: number; nextAt?: string | null; limit?: number } = {},
  ) {
    super(message);
  }
}

export async function createReport(
  userId: string,
  input: CreateRequest,
  /** Lot « un Limpid par document » : limites déjà vérifiées pour tout le lot. */
  opts: { limitsChecked?: boolean } = {},
): Promise<{ reportId: string }> {
  const db = adminClient();

  // Double envoi : la même clé renvoie le même rapport, sans nouvelle tâche.
  const existing = await db
    .from("jobs")
    .select("report_id")
    .eq("owner_id", userId)
    .eq("idempotency_key", input.idempotency_key)
    .maybeSingle();
  if (existing.data?.report_id) return { reportId: existing.data.report_id };

  const settings = await db.from("app_settings").select("generation_enabled").single();
  if (!settings.data?.generation_enabled) {
    throw new CreateError("generation_disabled", "La génération est suspendue par l'administrateur.");
  }
  // Droits de l'offre vérifiés avant toute lecture du document (aucun travail perdu).
  const ent = await getEntitlements(userId);
  if (!opts.limitsChecked) await assertCanCreate(userId, ent, 1);

  let sourceIds: string[];
  if ("source_ids" in input) {
    sourceIds = [...new Set(input.source_ids)];
  } else if ("source_id" in input) {
    sourceIds = [input.source_id];
  } else {
    const { mode: _m, level: _l, goal: _g, target_pages: _t, template: _tp, theme: _th, visual_mode: _vm, idempotency_key: _k, ...source } = input;
    try {
      sourceIds = [(await prepareSource(userId, source as PrepareRequest)).sourceId];
    } catch (e) {
      if (e instanceof PrepareError) throw new CreateError(e.code, e.message, e.pages);
      throw e;
    }
  }

  // Chaque document : au compte, lisible (ou en attente d'OCR), pas encore utilisé par un Limpid.
  const { data: rows } = await db
    .from("sources")
    .select("id, title, status, coverage")
    .in("id", sourceIds)
    .eq("owner_id", userId)
    .is("deleted_at", null);
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
  const ocrSources: string[] = [];
  for (const id of sourceIds) {
    const src = byId.get(id);
    const pendingOcr = !!src && src.status === "extracting" && (src.coverage as { pending_ocr?: boolean } | null)?.pending_ocr === true;
    if (!src || !(src.status === "extracted" || src.status === "partial" || pendingOcr)) {
      throw new CreateError("source_missing", "Un document n'est plus disponible. Retirez-le ou ajoutez-le à nouveau.");
    }
    if (pendingOcr) ocrSources.push(id);
  }
  // Un document, un Limpid : supprimer le Limpid supprime aussi ses documents.
  const [{ data: usedSet }, { data: usedLegacy }] = await Promise.all([
    db.from("report_sources").select("report_id, reports!inner(deleted_at)").in("source_id", sourceIds).is("reports.deleted_at", null).limit(1).maybeSingle(),
    db.from("reports").select("id").in("source_id", sourceIds).is("deleted_at", null).limit(1).maybeSingle(),
  ]);
  const used = (usedSet?.report_id as string | undefined) ?? usedLegacy?.id;
  if (used) throw new CreateError("source_used", "Ce document a déjà son Limpid.", undefined, used);
  if (sourceIds.length > ent.limits.sourcesPerReport) {
    throw new CreateError("plan_sources", "Trop de documents pour votre offre.", undefined, undefined, { limit: ent.limits.sourcesPerReport });
  }
  const sourceId = sourceIds[0]!;
  const first = byId.get(sourceId)!;
  const title = sourceIds.length > 1 ? `${first.title} + ${sourceIds.length - 1}`.slice(0, 300) : first.title;

  const auto = await automaticSettings(userId, sourceIds, input.mode);
  const mode = input.mode ?? auto.mode;
  const level = input.level ?? auto.level;
  const goal = input.goal ?? auto.goal;
  const targetPages = input.target_pages ?? auto.targetPages;
  const theme = input.theme ?? null;
  const visualMode = effectiveVisualMode(input.visual_mode ?? "auto");

  // Devis fixe selon la taille réelle du texte lu, puis réservation avant tout appel IA.
  const action = reportAction(auto.chars);
  let reservationId: string;
  try {
    ({ reservationId } = await reserveCredits(userId, action, `report:${input.idempotency_key}`, {}, { wallet: ent.wallet }));
  } catch (e) {
    throw creditFailure(e);
  }
  const report = await db
    .from("reports")
    .insert({ owner_id: userId, source_id: sourceId, title, theme_id: theme, visual_mode: visualMode, mode })
    .select("id")
    .single();
  if (report.error || !report.data) {
    await releaseReservation(reservationId);
    throw new CreateError("storage", "Création du rapport impossible.");
  }
  // Ensemble de sources figé au lancement, dans l'ordre choisi.
  const set = await db
    .from("report_sources")
    .insert(sourceIds.map((id, position) => ({ report_id: report.data.id, source_id: id, owner_id: userId, position })));
  if (set.error) {
    await db.from("reports").delete().eq("id", report.data.id);
    await releaseReservation(reservationId);
    throw new CreateError("storage", "Création du rapport impossible.");
  }

  const job = await db.from("jobs").insert({
    owner_id: userId,
    report_id: report.data.id,
    source_id: sourceId,
    kind: "generate_report",
    idempotency_key: input.idempotency_key,
    params: {
      mode,
      language: auto.language,
      level,
      goal,
      target_pages: targetPages,
      ...(input.template ? { template: input.template } : {}),
      visual_mode: visualMode,
      ...(sourceIds.length > 1 ? { source_ids: sourceIds } : {}),
      ...(ocrSources.length ? { ocr: true, ocr_sources: ocrSources } : {}),
      credits: { action, amount: ACTION_PRICES[action] },
    },
  }).select("id").single();
  if (job.error) {
    await db.from("reports").delete().eq("id", report.data.id);
    // Course entre deux envois simultanés : on renvoie le rapport de celui qui a gagné.
    if (job.error.code === "23505") {
      const winner = await db
        .from("jobs")
        .select("report_id")
        .eq("owner_id", userId)
        .eq("idempotency_key", input.idempotency_key)
        .maybeSingle();
      // Même clé : la réservation est celle du gagnant, elle n'est pas rendue.
      if (winner.data?.report_id) return { reportId: winner.data.report_id };
    }
    await releaseReservation(reservationId);
    throw new CreateError("storage", "Création de la tâche impossible.");
  }
  await attachReservation(reservationId, { jobId: job.data.id as string, reportId: report.data.id });
  await recordLimitEvent(userId, REPORT_CREATED, report.data.id);
  // Le dernier choix explicite est retenu pour le prochain import.
  if (input.mode) await db.from("reader_preferences").upsert({ owner_id: userId, default_mode: input.mode });
  return { reportId: report.data.id };
}

export const BatchRequest = z.strictObject({
  source_ids: z.array(z.string().uuid()).min(1).max(MAX_SOURCES),
  mode: Mode.optional(),
  visual_mode: VisualMode.optional(),
  idempotency_key: z.string().regex(/^[A-Za-z0-9_-]{8,90}$/),
});

/**
 * « Un Limpid par document » : générations indépendantes, une par document, avec la même
 * approche. Les limites sont vérifiées pour tout le lot avant la première création ; les
 * tâches sont mises en file et traitées une à une. Une reprise (même clé) ne recrée rien.
 */
export async function createBatch(userId: string, input: z.infer<typeof BatchRequest>): Promise<{ reportIds: string[] }> {
  const ids = [...new Set(input.source_ids)];
  const db = adminClient();
  const keys = ids.map((_, i) => `${input.idempotency_key}-${i}`);
  const { data: done } = await db.from("jobs").select("report_id, idempotency_key").eq("owner_id", userId).in("idempotency_key", keys);
  const already = new Map((done ?? []).map((j) => [j.idempotency_key as string, j.report_id as string]));
  const todo = keys.filter((k) => !already.has(k)).length;
  // Droits vérifiés pour tout le lot avant la première création ; chaque Limpid réserve
  // ensuite son propre prix (selon la taille de son document).
  if (todo > 0) await assertCanCreate(userId, await getEntitlements(userId), todo);
  const reportIds: string[] = [];
  for (const [i, sourceId] of ids.entries()) {
    const key = keys[i]!;
    const existing = already.get(key);
    if (existing) {
      reportIds.push(existing);
      continue;
    }
    const { reportId } = await createReport(
      userId,
      { source_id: sourceId, mode: input.mode, visual_mode: input.visual_mode, idempotency_key: key },
      { limitsChecked: true },
    );
    reportIds.push(reportId);
  }
  return { reportIds };
}

const LEVEL_BY_FAMILIARITY: Record<string, z.infer<typeof Level>> = { aucune: "grand_public", bases: "grand_public", maitrise: "etudiant" };

/** Niveau rédactionnel d'une approche : très simple impose le niveau le plus simple. */
export function levelFor(mode: Mode, familiarity: string | null | undefined): z.infer<typeof Level> {
  if (mode === "tres_simple") return "ultra_simple";
  return LEVEL_BY_FAMILIARITY[familiarity ?? ""] ?? "grand_public";
}

/**
 * Réglages automatiques : approche (choix explicite, sinon le dernier, sinon explication
 * claire), niveau selon l'approche et la familiarité, objectif selon les préférences, plan
 * de pages selon la taille du texte lu, langue des explications.
 */
export async function automaticSettings(userId: string, sourceIds: string | string[], chosen?: Mode) {
  const db = adminClient();
  const ids = Array.isArray(sourceIds) ? sourceIds : [sourceIds];
  const [{ data: prefs }, { data: segs }] = await Promise.all([
    db.from("reader_preferences").select("familiarity, goal, default_mode, explanation_lang").eq("owner_id", userId).maybeSingle(),
    db.from("source_segments").select("text").in("source_id", ids).limit(6_000),
  ]);
  // Pages encore à lire par OCR : estimées (2 500 caractères par page) pour le devis.
  const { data: pending } = await db.from("sources").select("page_count, coverage").in("id", ids);
  const ocrChars = (pending ?? [])
    .filter((s) => (s.coverage as { pending_ocr?: boolean } | null)?.pending_ocr === true)
    .reduce((n, s) => n + ((s.page_count as number | null) ?? 1) * 2_500, 0);
  const chars = (segs ?? []).reduce((n, x) => n + (x.text as string).length, 0) + ocrChars;
  const mode: Mode = chosen ?? Mode.safeParse(prefs?.default_mode).data ?? "claire";
  return {
    chars,
    mode,
    level: levelFor(mode, prefs?.familiarity),
    goal: mode === "revision" ? ("reviser" as const) : (Goal.safeParse(prefs?.goal).data ?? "comprendre"),
    targetPages: planPages(chars, mode),
    language: (prefs?.explanation_lang === "fr" || prefs?.explanation_lang === "en" ? prefs.explanation_lang : null) as "fr" | "en" | null,
  };
}

/** Ancien repère (V3), conservé pour les tests de compatibilité. */
export function pagesForLength(chars: number): number {
  return planPages(chars, "claire");
}

type Entitlements = Awaited<ReturnType<typeof getEntitlements>>;

/**
 * Droits de l'offre pour `count` nouveaux Limpid : préparations simultanées, Limpid conservés,
 * limite hebdomadaire du gratuit, crédits pour au moins un rapport court chacun.
 */
async function assertCanCreate(userId: string, ent: Entitlements, count: number) {
  const usage = await accountUsage(userId);
  if (usage.active >= ent.limits.concurrentJobs) {
    throw new CreateError("limit", "Un rapport est déjà en préparation. Attendez qu'il soit prêt pour en lancer un autre.");
  }
  if (usage.kept + count > ent.limits.keptReports) {
    throw new CreateError("plan_reports", "Limite de Limpid conservés atteinte.", undefined, undefined, { limit: ent.limits.keptReports });
  }
  const weekly = ent.wallet.weekly;
  if (weekly && weekly.used + count > weekly.limit) {
    throw new CreateError("weekly", "Limite hebdomadaire atteinte.", undefined, undefined, { nextAt: weekly.nextAt, limit: weekly.limit });
  }
  const needed = ACTION_PRICES.report_short * count;
  if (ent.wallet.available < needed) {
    throw new CreateError("credits", "Crédits insuffisants.", undefined, undefined, { needed, available: ent.wallet.available });
  }
}

function creditFailure(e: unknown): CreateError {
  if (e instanceof CreditError) {
    if (e.code === "insufficient") return new CreateError("credits", e.message, undefined, undefined, e.detail);
    if (e.code === "weekly") return new CreateError("weekly", e.message, undefined, undefined, e.detail);
    return new CreateError("storage", e.message);
  }
  throw e;
}
