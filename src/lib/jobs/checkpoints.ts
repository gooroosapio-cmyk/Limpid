/**
 * Points de reprise du pipeline (Atlas) : la compréhension validée, puis la rédaction, sont
 * enregistrées pour la tâche. Une nouvelle invocation (délai de la fonction, nouvel essai)
 * repart de la dernière sortie validée, sans nouvel appel ni nouvelle dépense. Un point de
 * reprise d'une autre version des consignes est ignoré.
 */
import "server-only";
import { z } from "zod";
import { Evidence, ExplanationObject, KnowledgeObject, ReportBlueprint, ValidationResult } from "@/lib/contracts/schemas";
import { PROMPT_VERSION, ReportPlan, type GenerationOutput, type Understanding } from "@/lib/engine/pipeline";
import type { StepStore } from "@/lib/engine/v5";
import { adminClient } from "@/lib/supabase/admin";

export const UnderstandingCheckpoint = z.object({
  knowledge: KnowledgeObject,
  evidence: z.array(Evidence),
  validation: ValidationResult,
  plan: ReportPlan.nullable(),
});

export const WritingCheckpoint = z.object({
  status: z.enum(["validated", "incomplete"]),
  explanation: ExplanationObject,
  blueprint: ReportBlueprint,
  validation: z.object({ explanation: ValidationResult }),
});

type Stage = "comprehension" | "explication" | "plan" | `frag_${number}` | `chap_${number}`;

/** Lit et revalide un point de reprise ; tout écart (version, schéma) vaut absence. */
export function parseCheckpoint<T extends z.ZodType>(schema: T, row: { prompt_version: string; payload: unknown } | null | undefined): z.infer<T> | null {
  if (!row || row.prompt_version !== PROMPT_VERSION) return null;
  const parsed = schema.safeParse(row.payload);
  return parsed.success ? parsed.data : null;
}

async function load(jobId: string, stage: Stage) {
  const { data } = await adminClient().from("generation_checkpoints").select("prompt_version, payload").eq("job_id", jobId).eq("stage", stage).maybeSingle();
  return data as { prompt_version: string; payload: unknown } | null;
}

async function save(jobId: string, stage: Stage, payload: unknown) {
  // Un échec d'écriture ne bloque jamais la génération : la reprise refera simplement l'étape.
  await adminClient()
    .from("generation_checkpoints")
    .upsert({ job_id: jobId, stage, prompt_version: PROMPT_VERSION, payload }, { onConflict: "job_id,stage" });
}

export async function loadUnderstanding(jobId: string): Promise<Understanding | null> {
  return parseCheckpoint(UnderstandingCheckpoint, await load(jobId, "comprehension"));
}

/** Seule une compréhension sans erreur bloquante est réutilisable. */
export async function saveUnderstanding(jobId: string, u: Understanding) {
  if (u.validation.blocking_errors.length === 0) await save(jobId, "comprehension", u);
}

export async function loadWriting(jobId: string, u: Understanding): Promise<GenerationOutput | null> {
  const w = parseCheckpoint(WritingCheckpoint, await load(jobId, "explication"));
  if (!w) return null;
  return { status: w.status, knowledge: u.knowledge, evidence: u.evidence, explanation: w.explanation, blueprint: w.blueprint, validation: { knowledge: u.validation, explanation: w.validation.explanation } };
}

export async function saveWriting(jobId: string, out: GenerationOutput) {
  if (out.validation.explanation.blocking_errors.length > 0) return;
  await save(jobId, "explication", { status: out.status, explanation: out.explanation, blueprint: out.blueprint, validation: { explanation: out.validation.explanation } });
}

/** Magasin de reprises d'une tâche pour le moteur V5 (fragments, plan, chapitres). */
export function jobStore(jobId: string): StepStore {
  return {
    async load(stage, schema) {
      const { data } = await adminClient().from("generation_checkpoints").select("prompt_version, payload").eq("job_id", jobId).eq("stage", stage).maybeSingle();
      return parseCheckpoint(schema, data as { prompt_version: string; payload: unknown } | null);
    },
    async save(stage, payload) {
      await adminClient()
        .from("generation_checkpoints")
        .upsert({ job_id: jobId, stage, prompt_version: PROMPT_VERSION, payload }, { onConflict: "job_id,stage" });
    },
  };
}
