/**
 * Bilan final côté serveur (kit V5) : questions publiques (sans réponses) pour la page plein
 * écran, puis correction et note calculées ici à la soumission. Une même clé de tentative
 * rend le même résultat sans compter deux fois.
 */
import "server-only";
import { z } from "zod";
import { ExerciseSet, ExplanationObject } from "@/lib/contracts/schemas";
import { gradeBilan, publicQuestion, type BilanResult, type PublicQuestion } from "@/lib/exercises/bilan";
import type { Answer } from "@/lib/exercises/grade";
import { adminClient } from "@/lib/supabase/admin";

const PieceId = z.string().regex(/^[a-z]{1,6}_[A-Za-z0-9_-]{1,64}$/);
const short = z.string().max(200);

export const AnswerSchema: z.ZodType<Answer> = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("single"), choice: z.number().int().min(0).max(10) }),
  z.strictObject({ kind: z.literal("multiple"), choices: z.array(z.number().int().min(0).max(10)).max(10) }),
  z.strictObject({ kind: z.literal("truefalse"), value: z.boolean() }),
  z.strictObject({ kind: z.literal("order"), order: z.array(short).max(10) }),
  z.strictObject({ kind: z.literal("match"), pairs: z.record(short, short) }),
  z.strictObject({ kind: z.literal("cloze"), values: z.array(z.string().max(80)).max(6) }),
  z.strictObject({ kind: z.literal("short"), text: z.string().max(2_000) }),
]);

export const BilanSubmit = z.strictObject({
  version_id: z.string().uuid(),
  attempt_key: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
  answers: z.record(PieceId, AnswerSchema),
});

interface BilanData {
  versionId: string;
  questions: { exercise: z.infer<typeof ExerciseSet>["bilan"][number] }[];
  chapters: { id: string; title: string }[];
  insufficient: boolean;
}

async function load(userId: string, reportId: string, versionId?: string): Promise<BilanData | null> {
  const db = adminClient();
  const { data: report } = await db.from("reports").select("id, current_version_id").eq("id", reportId).eq("owner_id", userId).is("deleted_at", null).maybeSingle();
  const vid = versionId ?? (report?.current_version_id as string | null);
  if (!report || !vid) return null;
  const { data: version } = await db.from("report_versions").select("id, explanation").eq("id", vid).eq("report_id", reportId).eq("owner_id", userId).maybeSingle();
  if (!version) return null;
  const { data: quiz } = await db.from("report_quizzes").select("questions").eq("report_version_id", vid).eq("scope_key", "exercises").maybeSingle();
  const set = ExerciseSet.safeParse(quiz?.questions).data;
  const ex = ExplanationObject.safeParse(version.explanation).data;
  if (!set || !ex) return null;
  return {
    versionId: vid,
    questions: set.bilan.map((exercise) => ({ exercise })),
    chapters: ex.sections.map((s) => ({ id: s.id, title: s.question })),
    insufficient: set.insufficient,
  };
}

/** Données de la page : questions sans réponses, chapitres, version. */
export async function bilanPage(userId: string, reportId: string): Promise<{ versionId: string; questions: PublicQuestion[]; chapters: { id: string; title: string }[]; insufficient: boolean } | null> {
  const d = await load(userId, reportId);
  if (!d || d.questions.length === 0) return null;
  return { versionId: d.versionId, questions: d.questions.map((q) => publicQuestion(q.exercise)), chapters: d.chapters, insufficient: d.insufficient };
}

/** Correction, note et enregistrement de la tentative (idempotent par clé). */
export async function submitBilan(userId: string, reportId: string, input: z.infer<typeof BilanSubmit>): Promise<BilanResult | null> {
  const d = await load(userId, reportId, input.version_id);
  if (!d || d.questions.length === 0) return null;
  const exercises = d.questions.map((q) => q.exercise);
  const result = gradeBilan(exercises, input.answers, d.chapters.map((c) => c.id));
  if (result.total > 0) {
    await adminClient()
      .from("quiz_attempts")
      .upsert(
        {
          owner_id: userId,
          report_version_id: d.versionId,
          kind: "bilan",
          section_id: null,
          score: result.score,
          total: Math.min(25, result.total),
          answers: result.questions.map((q) => ({ id: q.id, correct: q.correct, ratio: q.correct === null ? null : q.correct ? 1 : 0 })),
          attempt_key: input.attempt_key,
        },
        { onConflict: "owner_id,attempt_key", ignoreDuplicates: true },
      );
  }
  return result;
}
