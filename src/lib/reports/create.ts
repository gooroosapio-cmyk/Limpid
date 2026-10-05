/**
 * Création d'un rapport à partir d'une source déjà préparée et vérifiée par le lecteur :
 * limites du compte, rapport et tâche de génération, écrits côté serveur pour l'utilisateur
 * authentifié. Idempotent par clé client.
 */
import "server-only";
import { z } from "zod";
import { Goal, Level, Mode, TargetPages, TemplateId, ThemeId, VisualMode } from "@/lib/contracts/schemas";
import { planPages } from "@/lib/engine/pipeline";
import { assertCanStartJob, LimitError, recordLimitEvent, REPORT_CREATED } from "@/lib/jobs/limits";
import { PrepareError, PrepareText, PrepareUpload, PrepareUrl, prepareSource, type PrepareRequest } from "@/lib/sources/prepare";
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
      | "source_used",
    message: string,
    /** Pages à lire par OCR (demande d'accord). */
    public readonly pages?: number,
    /** Rapport déjà créé pour cette source. */
    public readonly reportId?: string,
  ) {
    super(message);
  }
}

export async function createReport(userId: string, input: CreateRequest): Promise<{ reportId: string }> {
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
  // Limites du compte vérifiées avant toute lecture du document (aucun travail perdu).
  try {
    await assertCanStartJob(userId, { newReport: true });
  } catch (e) {
    if (e instanceof LimitError) throw new CreateError("limit", e.message);
    throw e;
  }

  let sourceId: string;
  if ("source_id" in input) {
    sourceId = input.source_id;
  } else {
    const { mode: _m, level: _l, goal: _g, target_pages: _t, template: _tp, theme: _th, visual_mode: _vm, idempotency_key: _k, ...source } = input;
    try {
      sourceId = (await prepareSource(userId, source as PrepareRequest)).sourceId;
    } catch (e) {
      if (e instanceof PrepareError) throw new CreateError(e.code, e.message, e.pages);
      throw e;
    }
  }

  const { data: src } = await db
    .from("sources")
    .select("id, title, status, coverage")
    .eq("id", sourceId)
    .eq("owner_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  const pendingOcr = !!src && src.status === "extracting" && (src.coverage as { pending_ocr?: boolean } | null)?.pending_ocr === true;
  if (!src || !(src.status === "extracted" || src.status === "partial" || pendingOcr)) {
    throw new CreateError("source_missing", "Ce document n'est plus disponible. Ajoutez-le à nouveau.");
  }
  // Une source, un rapport : supprimer le rapport supprime aussi sa source.
  const { data: used } = await db.from("reports").select("id").eq("source_id", sourceId).is("deleted_at", null).limit(1).maybeSingle();
  if (used) throw new CreateError("source_used", "Ce document a déjà son rapport.", undefined, used.id);

  const auto = await automaticSettings(userId, sourceId, input.mode);
  const mode = input.mode ?? auto.mode;
  const level = input.level ?? auto.level;
  const goal = input.goal ?? auto.goal;
  const targetPages = input.target_pages ?? auto.targetPages;
  const theme = input.theme ?? null;
  const visualMode = effectiveVisualMode(input.visual_mode ?? "auto");
  const report = await db
    .from("reports")
    .insert({ owner_id: userId, source_id: sourceId, title: src.title, theme_id: theme, visual_mode: visualMode, mode })
    .select("id")
    .single();
  if (report.error || !report.data) throw new CreateError("storage", "Création du rapport impossible.");

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
      ...(pendingOcr ? { ocr: true } : {}),
    },
  });
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
      if (winner.data?.report_id) return { reportId: winner.data.report_id };
    }
    throw new CreateError("storage", "Création de la tâche impossible.");
  }
  await recordLimitEvent(userId, REPORT_CREATED, report.data.id);
  // Le dernier choix explicite est retenu pour le prochain import.
  if (input.mode) await db.from("reader_preferences").upsert({ owner_id: userId, default_mode: input.mode });
  return { reportId: report.data.id };
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
export async function automaticSettings(userId: string, sourceId: string, chosen?: Mode) {
  const db = adminClient();
  const [{ data: prefs }, { data: segs }] = await Promise.all([
    db.from("reader_preferences").select("familiarity, goal, default_mode, explanation_lang").eq("owner_id", userId).maybeSingle(),
    db.from("source_segments").select("text").eq("source_id", sourceId).limit(3_000),
  ]);
  const chars = (segs ?? []).reduce((n, x) => n + (x.text as string).length, 0);
  const mode: Mode = chosen ?? Mode.safeParse(prefs?.default_mode).data ?? "claire";
  return {
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
