/**
 * Création d'un rapport à partir d'une source déjà préparée et vérifiée par le lecteur :
 * limites du compte, rapport et tâche de génération, écrits côté serveur pour l'utilisateur
 * authentifié. Idempotent par clé client.
 */
import "server-only";
import { z } from "zod";
import { Goal, Level, Mode, TargetPages, TemplateId, ThemeId, V6_MODES, VisualMode } from "@/lib/contracts/schemas";
import { selectAll } from "@/lib/supabase/paginate";
import { planPages } from "@/lib/engine/pipeline";
import { recordLimitEvent, REPORT_CREATED } from "@/lib/jobs/limits";
import { CHARS_PER_PAGE, ENGINE_MAX_CONTENT_PAGES, sourcePages } from "@/lib/billing/catalog";
import { accountEnvelope, envelopeXof } from "@/lib/billing/envelope";
import { contentPages, quoteCourse, type CourseQuote } from "@/lib/billing/quote";
import { accountUsage, attachReservation, CreditError, getEntitlements, quotaBlock, releaseReservation, reserveCredits } from "@/lib/billing/wallet";
import { limits as engineLimits } from "@/lib/config";
import { PrepareError, PrepareText, PrepareUpload, PrepareUrl, prepareSource, type PrepareRequest } from "@/lib/sources/prepare";
import { MAX_SOURCES } from "@/lib/reports/source-set";
import { adminClient } from "@/lib/supabase/admin";
import { DERIVED_SUPPORTS, modeForSupports, SupportSelection, supportsForMode, withIncludedSupports, type Support } from "@/lib/supports/supports";
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
  /** Dossier sélectionné dans la bibliothèque : le nouveau Limpid y est rangé. */
  folder_id: z.string().uuid().nullable().optional(),
  /**
   * Supports d'apprentissage (livre, parcours, carte, flashcards), au moins un. Absents : ancien
   * envoi, déduits de l'approche (le livre par défaut).
   */
  supports: SupportSelection.optional(),
  /** Nouvelles images raster choisies dans le devis (0 par défaut, plafond du forfait). */
  images: z.number().int().min(0).max(10).optional(),
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
      | "quota"
      | "plan_reports"
      | "plan_sources"
      | "plan_ocr"
      | "plan_images"
      | "too_long",
    message: string,
    /** Pages à lire par OCR (demande d'accord). */
    public readonly pages?: number,
    /** Rapport déjà créé pour cette source. */
    public readonly reportId?: string,
    /** Crédits manquants, limite atteinte : de quoi expliquer la limite exacte (§ 11). */
    public readonly detail: { needed?: number; available?: number; nextAt?: string | null; limit?: number; periodLimit?: number } = {},
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

  const settings = await db.from("app_settings").select("generation_enabled, writer_model, account_cap_mode").single();
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
    const { mode: _m, level: _l, goal: _g, target_pages: _t, template: _tp, theme: _th, visual_mode: _vm, idempotency_key: _k, supports: _s, images: _i, folder_id: _f, ...source } = input;
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

  // Carte mentale et flashcards : incluses dans tout nouveau cours, sans supplément.
  const supports: Support[] = withIncludedSupports(input.supports ?? supportsForMode(input.mode));
  // L'adaptation au document est la règle interne ; un parcours seul garde l'écriture par étapes.
  const chosenMode = input.supports ? modeForSupports(supports) : input.mode;
  const auto = await automaticSettings(userId, sourceIds, chosenMode);
  const mode = chosenMode ?? auto.mode;
  const level = input.level ?? auto.level;
  const goal = input.goal ?? auto.goal;
  const targetPages = input.target_pages ?? auto.targetPages;
  const theme = input.theme ?? null;
  const visualMode = effectiveVisualMode(input.visual_mode ?? "auto");

  // Limites de la tâche (somme des documents), puis devis continu et réservation avant tout appel IA.
  assertWithinPlan(ent, auto.measure, input.images ?? 0);
  const quote = courseQuote(auto.measure, input.images ?? 0);
  // Enveloppe de coût du compte (§ 7.2, si activée) : refus avant toute réservation et tout appel.
  if ((settings.data as { account_cap_mode?: string } | null)?.account_cap_mode === "enforce") {
    const env = await accountEnvelope(userId);
    const budgetXof = envelopeXof(env.revenueXof, env.creditsUsed + quote.credits);
    if (!env.exempt && env.spentXof + quote.prudentXof > budgetXof) {
      throw new CreateError("limit", "Le budget IA de votre offre pour cette période est atteint. Il se renouvelle au prochain cycle.");
    }
  }
  let reservationId: string;
  try {
    ({ reservationId } = await reserveCredits(userId, "report", `report:${input.idempotency_key}`, {}, { wallet: ent.wallet, amount: quote.credits }));
  } catch (e) {
    throw creditFailure(e, quote.credits);
  }
  const releaseAll = () => releaseReservation(reservationId);
  // Dossier : seulement un dossier de ce compte (sinon le Limpid reste dans la bibliothèque).
  const folderId = input.folder_id
    ? ((await db.from("folders").select("id").eq("id", input.folder_id).eq("owner_id", userId).maybeSingle()).data?.id ?? null)
    : null;
  const report = await db
    .from("reports")
    .insert({ owner_id: userId, source_id: sourceId, title, theme_id: theme, visual_mode: visualMode, mode, folder_id: folderId, requested_supports: supports })
    .select("id")
    .single();
  if (report.error || !report.data) {
    await releaseAll();
    throw new CreateError("storage", "Création du rapport impossible.");
  }
  // Ensemble de sources figé au lancement, dans l'ordre choisi.
  const set = await db
    .from("report_sources")
    .insert(sourceIds.map((id, position) => ({ report_id: report.data.id, source_id: id, owner_id: userId, position })));
  if (set.error) {
    await db.from("reports").delete().eq("id", report.data.id);
    await releaseAll();
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
      ai_tier: ent.wallet.aiTier,
      writer: writerOf(settings.data),
      supports,
      images: quote.G,
      credits: { action: "report", amount: quote.credits, pages: quote.P, ocr_pages: quote.R, images: quote.G },
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
      // Même clé : la réservation est celle du gagnant, elle n'est jamais rendue ici.
      if (winner.data?.report_id) return { reportId: winner.data.report_id };
      throw new CreateError("storage", "Création de la tâche impossible.");
    }
    await releaseAll();
    throw new CreateError("storage", "Création de la tâche impossible.");
  }
  await attachReservation(reservationId, { jobId: job.data.id as string, reportId: report.data.id });
  // Supports inclus : en attente de la base commune, lancés par le worker dès sa livraison. Leur
  // échec éventuel n'affecte pas le cours (ils se relancent depuis l'onglet, sans frais).
  for (const support of DERIVED_SUPPORTS) {
    const { error } = await db.from("jobs").insert({
      owner_id: userId,
      report_id: report.data.id,
      source_id: sourceId,
      kind: "generate_support",
      status: "awaiting_confirmation",
      idempotency_key: `${input.idempotency_key}-${support}`,
      params: { support, depends_on: job.data.id, language: auto.language, ai_tier: ent.wallet.aiTier, included: true },
    });
    if (error && error.code !== "23505") console.error("support_job", error.code);
  }
  await recordLimitEvent(userId, REPORT_CREATED, report.data.id);
  // Le dernier choix explicite est retenu pour le prochain import.
  if (input.mode) await db.from("reader_preferences").upsert({ owner_id: userId, default_mode: input.mode });
  return { reportId: report.data.id };
}

export const BatchRequest = z.strictObject({
  source_ids: z.array(z.string().uuid()).min(1).max(MAX_SOURCES),
  mode: Mode.optional(),
  supports: SupportSelection.optional(),
  images: z.number().int().min(0).max(10).optional(),
  level: Level.optional(),
  target_pages: TargetPages.optional(),
  visual_mode: VisualMode.optional(),
  idempotency_key: z.string().regex(/^[A-Za-z0-9_-]{8,90}$/),
  folder_id: z.string().uuid().nullable().optional(),
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
      { source_id: sourceId, mode: input.mode, ...(input.supports ? { supports: input.supports } : {}), ...(input.images ? { images: input.images } : {}), level: input.level, target_pages: input.target_pages, visual_mode: input.visual_mode, idempotency_key: key, folder_id: input.folder_id ?? null },
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
    selectAll<{ source_id: string; text: string }>((from, to) => db.from("source_segments").select("source_id, text").in("source_id", ids).order("source_id").order("ordinal").range(from, to)),
  ]);
  // Pages encore à lire par OCR : estimées (2 500 caractères par page) pour le plan de pages.
  const { data: meta } = await db.from("sources").select("id, page_count, coverage").in("id", ids);
  const charsBy = new Map<string, number>();
  for (const x of segs ?? []) charsBy.set(x.source_id as string, (charsBy.get(x.source_id as string) ?? 0) + (x.text as string).length);
  let chars = 0;
  let pages = 0;
  const measure: SourceMeasure = { physicalPages: 0, contentPages: 0, ocrPages: 0 };
  for (const m of meta ?? []) {
    const coverage = m.coverage as { pending_ocr?: boolean; pending_ocr_pages?: number[] } | null;
    const pendingOcr = coverage?.pending_ocr === true;
    const pageCount = m.page_count as number | null;
    const native = charsBy.get(m.id as string) ?? 0;
    const c = native + (pendingOcr ? (pageCount ?? 1) * CHARS_PER_PAGE : 0);
    chars += c;
    pages += sourcePages(pageCount, c);
    // Devis (§ 4) : pages scannées à lire (R) et pages de contenu normalisées (P).
    const ocrPages = pendingOcr ? (pageCount ?? 1) : (coverage?.pending_ocr_pages?.length ?? 0);
    measure.physicalPages += pageCount ?? 0;
    measure.ocrPages += ocrPages;
    measure.contentPages += contentPages({ pages: pageCount, chars: native, ocrPages });
  }
  // V6 : sans choix, l'approche « Par défaut » (une ancienne préférence V4 n'est plus proposée).
  const saved = Mode.safeParse(prefs?.default_mode).data;
  const mode: Mode = chosen ?? (saved && (V6_MODES as readonly string[]).includes(saved) ? saved : "auto");
  return {
    chars,
    pages,
    measure,
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

/** Rédacteur des nouvelles tâches (réglage d'administration) : Luna standard ou Luna Pro. */
export function writerOf(row: { writer_model?: unknown } | null | undefined): "standard" | "pro" {
  return row?.writer_model === "standard" ? "standard" : "pro";
}

export async function currentWriter(): Promise<"standard" | "pro"> {
  const { data } = await adminClient().from("app_settings").select("writer_model").single();
  return writerOf(data);
}

/** Mesure d'un ensemble de documents pour le devis et les limites (somme des fichiers). */
export interface SourceMeasure {
  physicalPages: number;
  contentPages: number;
  ocrPages: number;
}

/** Devis d'un cours : prix continu (§ 4), pages manuscrites non détectées pour l'instant (H = 0). */
export function courseQuote(m: SourceMeasure, images: number): CourseQuote {
  return quoteCourse({ P: m.contentPages, R: m.ocrPages, H: 0, G: images });
}

/** Pages de contenu permises par tâche : plafond du forfait et capacité actuelle du moteur. */
export function contentCap(ent: Pick<Entitlements, "limits">): number {
  return Math.min(ent.limits.contentPagesPerTask, ENGINE_MAX_CONTENT_PAGES);
}

/** Pages scannées lisibles par tâche : plafond du forfait et du lecteur OCR. */
export function ocrCap(ent: Pick<Entitlements, "limits">): number {
  return Math.min(ent.limits.ocrPagesPerTask, engineLimits.maxOcrPages);
}

/** Limites d'une tâche (§ 3), vérifiées avant toute réservation et tout appel payant. */
export function assertWithinPlan(ent: Pick<Entitlements, "limits">, m: SourceMeasure, images: number) {
  const cap = contentCap(ent);
  if (m.contentPages > cap || m.physicalPages > ent.limits.physicalPagesPerTask) {
    const limit = m.contentPages > cap ? cap : ent.limits.physicalPagesPerTask;
    throw new CreateError("too_long", `Ce cours compte environ ${Math.max(m.contentPages, m.physicalPages)} pages : votre offre en traite ${limit} au plus par cours. Importez-le en plusieurs parties.`, Math.max(m.contentPages, m.physicalPages), undefined, { limit });
  }
  if (m.ocrPages > ocrCap(ent)) {
    throw new CreateError("plan_ocr", "Trop de pages scannées pour votre offre.", m.ocrPages, undefined, { limit: ocrCap(ent) });
  }
  if (images > ent.limits.imagesPerCourse) {
    throw new CreateError("plan_images", "Trop d'images générées pour votre offre.", undefined, undefined, { limit: ent.limits.imagesPerCourse });
  }
}

/**
 * Droits de l'offre pour `count` nouveaux Limpid : préparations simultanées, Limpid conservés,
 * générations de la période, crédits pour au moins un cours court chacun.
 */
async function assertCanCreate(userId: string, ent: Entitlements, count: number) {
  const usage = await accountUsage(userId);
  if (usage.active >= ent.limits.concurrentJobs) {
    throw new CreateError("limit", "Un rapport est déjà en préparation. Attendez qu'il soit prêt pour en lancer un autre.");
  }
  if (usage.kept + count > ent.limits.keptReports) {
    throw new CreateError("plan_reports", "Limite de Limpid conservés atteinte.", undefined, undefined, { limit: ent.limits.keptReports });
  }
  // Générations de la période pour tout le lot (revérifiées à la réservation, sous verrou).
  const q = ent.wallet.quotas;
  if (q) {
    const block = quotaBlock({ period: { ...q.period, used: q.period.used + count - 1 } });
    if (block) throw new CreateError("quota", "Limite de cours de la période atteinte.", undefined, undefined, block);
  }
  // Au moins le prix d'un cours d'une page chacun (le devis exact est réservé ensuite).
  const needed = quoteCourse({ P: 1, R: 0, H: 0, G: 0 }).credits * count;
  if (ent.wallet.available < needed) {
    throw new CreateError("credits", "Crédits insuffisants.", undefined, undefined, { needed, available: ent.wallet.available });
  }
}

function creditFailure(e: unknown, total?: number): CreateError {
  if (e instanceof CreditError) {
    // Crédits insuffisants : le besoin annoncé est le devis complet.
    if (e.code === "insufficient") return new CreateError("credits", e.message, undefined, undefined, total ? { ...e.detail, needed: total } : e.detail);
    if (e.code === "quota") return new CreateError("quota", e.message, undefined, undefined, e.detail);
    return new CreateError("storage", e.message);
  }
  throw e;
}
