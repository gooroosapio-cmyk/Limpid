/**
 * Création d'un rapport à partir d'une source déjà préparée et vérifiée par le lecteur :
 * limites du compte, rapport et tâche de génération, écrits côté serveur pour l'utilisateur
 * authentifié. Idempotent par clé client.
 */
import "server-only";
import { z } from "zod";
import { Goal, Level, TargetPages, TemplateId, ThemeId, VisualMode } from "@/lib/contracts/schemas";
import { assertCanStartJob, LimitError, recordLimitEvent, REPORT_CREATED } from "@/lib/jobs/limits";
import { PrepareError, PrepareText, PrepareUpload, PrepareUrl, prepareSource, type PrepareRequest } from "@/lib/sources/prepare";
import { adminClient } from "@/lib/supabase/admin";
import { effectiveVisualMode } from "@/lib/visuals/config";

const Settings = {
  /** Absents (parcours V3) : déduits des préférences et de la taille du document. */
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
    const { level: _l, goal: _g, target_pages: _t, template: _tp, theme: _th, visual_mode: _vm, idempotency_key: _k, ...source } = input;
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

  const auto = await automaticSettings(userId, sourceId);
  const level = input.level ?? auto.level;
  const goal = input.goal ?? auto.goal;
  const targetPages = input.target_pages ?? auto.targetPages;
  const theme = input.theme ?? auto.theme;
  const visualMode = effectiveVisualMode(input.visual_mode ?? "auto");
  const report = await db
    .from("reports")
    .insert({ owner_id: userId, source_id: sourceId, title: src.title, theme_id: theme, visual_mode: visualMode })
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
  return { reportId: report.data.id };
}

const LEVEL_BY_FAMILIARITY: Record<string, z.infer<typeof Level>> = { aucune: "grand_public", bases: "grand_public", maitrise: "etudiant" };

/**
 * Réglages automatiques (kit V3 : aucun choix de longueur ni de modèle à l'import) : niveau selon
 * la familiarité déclarée, objectif selon les préférences, longueur selon la taille du document,
 * thème par défaut du lecteur (null = choisi selon l'organisation du rapport).
 */
export async function automaticSettings(userId: string, sourceId: string) {
  const db = adminClient();
  const [{ data: prefs }, { data: segs }] = await Promise.all([
    db.from("reader_preferences").select("familiarity, goal, theme_id").eq("owner_id", userId).maybeSingle(),
    db.from("source_segments").select("text").eq("source_id", sourceId).limit(3_000),
  ]);
  const chars = (segs ?? []).reduce((n, x) => n + (x.text as string).length, 0);
  return {
    level: LEVEL_BY_FAMILIARITY[prefs?.familiarity ?? ""] ?? "grand_public",
    goal: Goal.safeParse(prefs?.goal).data ?? "comprendre",
    targetPages: pagesForLength(chars),
    theme: ThemeId.safeParse(prefs?.theme_id).data ?? null,
  } as const;
}

/** Longueur du rapport selon le texte lu (OCR en attente : longueur standard). */
export function pagesForLength(chars: number): 5 | 7 | 12 {
  if (chars === 0 || chars <= 12_000) return 5;
  if (chars <= 60_000) return 7;
  return 12;
}
