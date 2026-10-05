/**
 * Progression de lecture, statut lu et tentatives de quiz (V4). Écritures par le serveur
 * après contrôle du propriétaire ; lecture via la RLS.
 */
import "server-only";
import { z } from "zod";
import { Exercise, ExerciseSet } from "@/lib/contracts/schemas";
import { askGrade } from "@/lib/reports/checks";
import { getProvider } from "@/lib/engine";
import { adminClient } from "@/lib/supabase/admin";
import { guardReaderCall, providerFailure, ReaderAIError, recordReaderUsage } from "./ai-call";

const PieceId = z.string().regex(/^[a-z]{1,6}_[A-Za-z0-9_-]{1,64}$/);

export const ProgressRequest = z.strictObject({ anchor: PieceId.nullable().optional(), read: z.boolean().optional() });

async function ownedReport(userId: string, reportId: string) {
  const { data } = await adminClient()
    .from("reports")
    .select("id, current_version_id")
    .eq("id", reportId)
    .eq("owner_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

/** Enregistre la position de lecture ; « read » marque le rapport comme lu (première fois seulement). */
export async function saveProgress(userId: string, reportId: string, input: z.infer<typeof ProgressRequest>): Promise<boolean> {
  if (!(await ownedReport(userId, reportId))) return false;
  const db = adminClient();
  const { data: row } = await db.from("report_progress").select("read_at").eq("owner_id", userId).eq("report_id", reportId).maybeSingle();
  const now = new Date().toISOString();
  const { error } = await db.from("report_progress").upsert({
    owner_id: userId,
    report_id: reportId,
    ...(input.anchor !== undefined ? { anchor: input.anchor } : {}),
    read_at: row?.read_at ?? (input.read ? now : null),
    updated_at: now,
  });
  return !error;
}

export const AttemptRequest = z.strictObject({
  version_id: z.string().uuid(),
  kind: z.enum(["bilan", "checkpoint"]),
  section_id: PieceId.nullable().optional(),
  score: z.number().int().min(0).max(25),
  total: z.number().int().min(1).max(25),
  answers: z
    .array(z.strictObject({ id: PieceId, correct: z.boolean().nullable(), ratio: z.number().min(0).max(1).nullable() }))
    .max(25),
});

/** Conserve une tentative (une nouvelle tentative n'efface jamais les précédentes). */
export async function saveAttempt(userId: string, reportId: string, input: z.infer<typeof AttemptRequest>): Promise<boolean> {
  if (input.score > input.total) return false;
  const db = adminClient();
  const { data: version } = await db
    .from("report_versions")
    .select("id")
    .eq("id", input.version_id)
    .eq("report_id", reportId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!version) return false;
  const { error } = await db.from("quiz_attempts").insert({
    owner_id: userId,
    report_version_id: version.id,
    kind: input.kind,
    section_id: input.section_id ?? null,
    score: input.score,
    total: input.total,
    answers: input.answers,
  });
  return !error;
}

export async function listAttempts(userId: string, reportId: string, versionId: string) {
  const db = adminClient();
  const { data: version } = await db.from("report_versions").select("id").eq("id", versionId).eq("report_id", reportId).eq("owner_id", userId).maybeSingle();
  if (!version) return [];
  const { data } = await db
    .from("quiz_attempts")
    .select("score, total, created_at")
    .eq("owner_id", userId)
    .eq("report_version_id", versionId)
    .eq("kind", "bilan")
    .order("created_at", { ascending: false })
    .limit(10);
  return data ?? [];
}

export const GradeRequest = z.strictObject({
  version_id: z.string().uuid(),
  exercise_id: PieceId,
  answer: z.string().trim().min(2).max(2_000),
});

const STAGE = "exercise_grade";

/**
 * Réponse libre : évaluée par le modèle léger avec la grille de la question et ses extraits.
 * Le résultat est indicatif (présenté comme tel), jamais un verdict absolu.
 */
export async function gradeShortAnswer(userId: string, reportId: string, input: z.infer<typeof GradeRequest>) {
  const db = adminClient();
  const { data: row } = await db
    .from("report_quizzes")
    .select("questions, report_versions!inner(id, report_id, knowledge_id)")
    .eq("owner_id", userId)
    .eq("report_version_id", input.version_id)
    .eq("scope_key", "exercises")
    .maybeSingle();
  const version = row?.report_versions as unknown as { report_id: string; knowledge_id: string } | undefined;
  if (!row || version?.report_id !== reportId) throw new ReaderAIError("not_found", "Question introuvable.");
  const set = ExerciseSet.safeParse(row.questions).data;
  const ex = set ? [...set.bilan, ...set.checkpoints.flatMap((c) => c.exercises)].find((q) => q.id === input.exercise_id) : undefined;
  if (!ex || ex.kind !== "short" || !ex.expected) throw new ReaderAIError("not_found", "Question introuvable.");
  await guardReaderCall(userId, STAGE, 40, 2);
  const { data: ev } = await db.from("evidence").select("id, quote").eq("knowledge_id", version.knowledge_id).in("id", ex.evidence_ids.length ? ex.evidence_ids : ["-"]);
  try {
    const res = await askGrade(
      getProvider(),
      { question: ex.prompt, expected_points: ex.rubric.length ? ex.rubric : [ex.expected], misconception_hints: [] },
      [`Réponse attendue : ${ex.expected}`, ...(ev ?? []).map((e) => `« ${e.quote} »`)],
      input.answer,
      AbortSignal.timeout(65_000),
    );
    await recordReaderUsage(userId, STAGE, res.usage);
    return { ...res.feedback, indicative: true };
  } catch (e) {
    return providerFailure(userId, STAGE, e, "La correction n'a pas pu être faite. Réessayez.");
  }
}

export type { Exercise };
