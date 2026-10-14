/**
 * État des supports d'un cours (§ 4 et § 13), lu avec les droits de l'utilisateur : supports
 * demandés, résultat publié (version courante, sinon la plus récente, signalée à mettre à jour)
 * et dernière unité de génération de chaque support dérivé. Aucun appel IA.
 */
import "server-only";
import { createUserClient } from "@/lib/supabase/server";
import { FlashcardBank } from "./flashcards";
import { MindMap } from "./mindmap";
import { readSupports, type DerivedSupport, type Support } from "./supports";

export type SupportStatus = "ready" | "preparing" | "waiting" | "failed" | "absent";

export interface DerivedState<T> {
  status: SupportStatus;
  /** Résultat consultable (même pendant une nouvelle préparation ou après un échec). */
  data: T | null;
  /** Résultat issu d'une version antérieure du cours (à mettre à jour). */
  outdated: boolean;
  progress: { done: number; total: number } | null;
  errorCode: string | null;
}

export interface CourseSupports {
  requested: Support[];
  carte: DerivedState<MindMap>;
  flashcards: DerivedState<FlashcardBank>;
}

interface JobRow {
  status: string;
  error_code: string | null;
  progress: { chapters_done?: number; chapters_total?: number } | null;
  params: { support?: string } | null;
  created_at: string;
}

function stateOf<T>(type: DerivedSupport, artifacts: { type: string; report_version_id: string; body: unknown }[], jobs: JobRow[], currentVersionId: string, parse: (v: unknown) => T | null): DerivedState<T> {
  const mine = artifacts.filter((a) => a.type === type);
  const current = mine.find((a) => a.report_version_id === currentVersionId);
  const shown = current ?? mine[0] ?? null;
  const data = shown ? parse(shown.body) : null;
  const job = jobs.find((j) => j.params?.support === type) ?? null;
  const progress = job?.progress?.chapters_total ? { done: job.progress.chapters_done ?? 0, total: job.progress.chapters_total } : null;
  let status: SupportStatus;
  if (current && data) status = "ready";
  else if (job && ["queued", "running", "retrying"].includes(job.status)) status = "preparing";
  else if (job?.status === "awaiting_confirmation") status = "waiting";
  else if (job && ["failed", "uncertain"].includes(job.status)) status = "failed";
  else if (data) status = "ready";
  else status = "absent";
  return { status, data, outdated: !!data && !current, progress: status === "preparing" ? progress : null, errorCode: status === "failed" ? job?.error_code ?? null : null };
}

export async function loadSupports(reportId: string, currentVersionId: string): Promise<CourseSupports> {
  const supabase = await createUserClient();
  const [{ data: report }, { data: artifacts }, { data: jobs }] = await Promise.all([
    supabase.from("reports").select("requested_supports").eq("id", reportId).maybeSingle(),
    supabase.from("support_artifacts").select("type, report_version_id, body, published_at").eq("report_id", reportId).order("published_at", { ascending: false }).limit(10),
    supabase.from("jobs").select("status, error_code, progress, params, created_at").eq("report_id", reportId).eq("kind", "generate_support").order("created_at", { ascending: false }).limit(10),
  ]);
  const requested = readSupports(report?.requested_supports);
  const rows = (artifacts ?? []) as { type: string; report_version_id: string; body: unknown }[];
  const list = (jobs ?? []) as JobRow[];
  return {
    requested,
    carte: stateOf("carte", rows, list, currentVersionId, (v) => MindMap.safeParse(v).data ?? null),
    flashcards: stateOf("flashcards", rows, list, currentVersionId, (v) => FlashcardBank.safeParse(v).data ?? null),
  };
}
