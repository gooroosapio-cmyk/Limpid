/**
 * Worker de génération : réserve une tâche (bail), exécute le pipeline, enregistre
 * connaissance, preuves, version et consommation. Aucun contenu privé dans les codes
 * d'erreur ni dans les journaux.
 */
import "server-only";
import { budget } from "@/lib/config";
import { PreferencesSnapshot, SourceSegment, type Goal, type Level } from "@/lib/contracts/schemas";
import { estimateCents, PRICE_BASIS } from "@/lib/budget";
import { getProvider } from "@/lib/engine";
import { generateReport, PROMPT_VERSION } from "@/lib/engine/pipeline";
import { ProviderError } from "@/lib/engine/provider";
import { adminClient } from "@/lib/supabase/admin";
import type { JobStage } from "./state";

export const WORKER_LEASE_SECONDS = 300;

interface JobRow {
  id: string;
  owner_id: string;
  report_id: string | null;
  source_id: string | null;
  kind: string;
  params: { level: Level; goal: Goal; target_pages: 5 | 7 | 12 };
}

class JobFailure extends Error {
  constructor(
    public readonly code: string,
    public readonly status: "failed" | "uncertain" | "cancelled" = "failed",
  ) {
    super(code);
  }
}

const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
};
const dayStart = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString();

async function spentCents(filter: { since: string; ownerId?: string }): Promise<number> {
  let q = adminClient().from("usage_ledger").select("actual_cents, reserved_cents").gte("created_at", filter.since);
  if (filter.ownerId) q = q.eq("owner_id", filter.ownerId);
  const { data, error } = await q;
  if (error) throw new JobFailure("budget_unreadable");
  return (data ?? []).reduce((sum, r) => sum + (r.actual_cents ?? r.reserved_cents ?? 0), 0);
}

/** Coupe-circuit : global mensuel, par compte sur 24 h (cadrage Q17). */
async function checkBudget(ownerId: string) {
  const db = adminClient();
  const { data: settings } = await db.from("app_settings").select("generation_enabled, monthly_cap_cents").single();
  if (!settings?.generation_enabled) throw new JobFailure("generation_disabled");
  const cap = Math.min(settings.monthly_cap_cents ?? budget.monthlyCapCents, budget.monthlyCapCents);
  if ((await spentCents({ since: monthStart() })) + budget.perReportCapCents > cap) throw new JobFailure("budget_monthly");
  if ((await spentCents({ since: dayStart(), ownerId })) + budget.perReportCapCents > budget.perAccountDailyCapCents) {
    throw new JobFailure("budget_daily");
  }
}

async function preferencesOf(ownerId: string): Promise<PreferencesSnapshot> {
  const { data } = await adminClient()
    .from("reader_preferences")
    .select("aids, minutes, density, example_domain, familiarity")
    .eq("owner_id", ownerId)
    .maybeSingle();
  const parsed = PreferencesSnapshot.safeParse({
    aids: data?.aids ?? [],
    minutes: data?.minutes ?? null,
    density: data?.density ?? null,
    example_domain: data?.example_domain ?? null,
    familiarity: data?.familiarity ?? null,
  });
  return parsed.success
    ? parsed.data
    : { aids: [], minutes: null, density: null, example_domain: null, familiarity: null };
}

async function loadSegments(sourceId: string): Promise<SourceSegment[]> {
  const { data, error } = await adminClient()
    .from("source_segments")
    .select("id, source_version, locator, text, content_hash, extraction_warnings")
    .eq("source_id", sourceId)
    .order("ordinal");
  if (error || !data?.length) throw new JobFailure("source_missing");
  return data.map((r) => SourceSegment.parse({ ...r, source_id: `src_${sourceId}` }));
}

async function setStage(jobId: string, stage: JobStage) {
  const db = adminClient();
  const { data } = await db
    .from("jobs")
    .update({
      stage,
      heartbeat_at: new Date().toISOString(),
      lease_expires_at: new Date(Date.now() + WORKER_LEASE_SECONDS * 1000).toISOString(),
    })
    .eq("id", jobId)
    .select("cancel_requested")
    .single();
  if (data?.cancel_requested) throw new JobFailure("cancelled", "cancelled");
}

async function finish(jobId: string, status: string, errorCode: string | null) {
  await adminClient()
    .from("jobs")
    .update({ status, error_code: errorCode, finished_at: new Date().toISOString(), lease_owner: null, lease_expires_at: null })
    .eq("id", jobId);
}

async function runGenerate(job: JobRow, controller: AbortController) {
  if (!job.source_id || !job.report_id) throw new JobFailure("job_invalid");
  const db = adminClient();
  await setStage(job.id, "validation");
  await checkBudget(job.owner_id);
  const segments = await loadSegments(job.source_id);
  const preferences = await preferencesOf(job.owner_id);
  const provider = getProvider();

  const out = await generateReport(provider, {
    sourceId: `src_${job.source_id}`,
    segments,
    level: job.params.level,
    goal: job.params.goal,
    targetPages: job.params.target_pages,
    preferences,
    signal: controller.signal,
    budgets: {
      comprehension: { tier: "fast", maxInputTokens: 120_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
      explanation: { tier: "quality", maxInputTokens: 120_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
    },
    onStage: (stage) => setStage(job.id, stage),
    onUsage: async (stage, attempt, u) => {
      const cents = estimateCents(u.inputTokens, u.outputTokens);
      await db.from("usage_ledger").upsert(
        {
          owner_id: job.owner_id,
          job_id: job.id,
          stage,
          attempt,
          provider: u.provider,
          model: u.model,
          status: u.inputTokens === null ? "uncertain" : "settled",
          reserved_cents: cents,
          actual_cents: u.inputTokens === null ? null : cents,
          input_tokens: u.inputTokens,
          output_tokens: u.outputTokens,
          duration_ms: u.durationMs,
          provider_request_id: u.requestId,
          price_basis: PRICE_BASIS,
        },
        { onConflict: "job_id,stage,attempt", ignoreDuplicates: true },
      );
    },
  });

  await setStage(job.id, "mise_en_page");
  const model = (await db.from("usage_ledger").select("model").eq("job_id", job.id).limit(1).maybeSingle()).data?.model;

  const ko = await db
    .from("knowledge_objects")
    .insert({
      owner_id: job.owner_id,
      source_id: job.source_id,
      source_version: segments[0]!.source_version,
      schema_version: out.knowledge.schema_version,
      prompt_version: PROMPT_VERSION,
      model: model ?? provider.name,
      body: out.knowledge,
      validation: out.validation.knowledge,
    })
    .select("id")
    .single();
  if (ko.error || !ko.data) throw new JobFailure("persist_knowledge");

  if (out.evidence.length) {
    const ev = await db.from("evidence").insert(
      out.evidence.map((e) => ({
        id: e.id,
        knowledge_id: ko.data.id,
        owner_id: job.owner_id,
        source_id: job.source_id,
        segment_id: e.segment_id,
        start_offset: e.start_offset,
        end_offset: e.end_offset,
        quote: e.quote,
      })),
    );
    if (ev.error) throw new JobFailure("persist_evidence");
  }

  const { count } = await db
    .from("report_versions")
    .select("id", { count: "exact", head: true })
    .eq("report_id", job.report_id);
  const version = await db
    .from("report_versions")
    .insert({
      report_id: job.report_id,
      owner_id: job.owner_id,
      version_number: (count ?? 0) + 1,
      knowledge_id: ko.data.id,
      level: job.params.level,
      goal: job.params.goal,
      template_id: out.blueprint.template_id,
      target_pages: job.params.target_pages,
      explanation: out.explanation,
      blueprint: out.blueprint,
      validation: out.validation.explanation,
      check_status: out.status === "validated" ? "validated" : "incomplete",
      change_reason: "generation_initiale",
      provider: provider.name,
      model: model ?? null,
      prompt_version: PROMPT_VERSION,
    })
    .select("id")
    .single();
  // Le trigger refuse l'écriture si le rapport a été supprimé entre-temps.
  if (version.error || !version.data) throw new JobFailure("persist_version");

  const rep = await db
    .from("reports")
    .update({ current_version_id: version.data.id, title: out.blueprint.title.slice(0, 300) })
    .eq("id", job.report_id)
    .is("deleted_at", null);
  if (rep.error) throw new JobFailure("persist_report");
  return out.status === "validated" ? "succeeded" : "incomplete_check";
}

function failureOf(e: unknown): JobFailure {
  if (e instanceof JobFailure) return e;
  if (e instanceof ProviderError) {
    if (e.code === "timeout_ambiguous") return new JobFailure("provider_timeout", "uncertain");
    if (e.code === "cancelled") return new JobFailure("cancelled", "cancelled");
    return new JobFailure(`provider_${e.code}`);
  }
  return new JobFailure("internal");
}

/** Réserve et exécute au plus une tâche. Renvoie l'identifiant traité, ou null si la file est vide. */
export async function runOneJob(workerId: string): Promise<string | null> {
  const db = adminClient();
  const { data, error } = await db.rpc("claim_job", { p_worker: workerId, p_lease_seconds: WORKER_LEASE_SECONDS });
  if (error) {
    console.error("claim_job", error.code);
    return null;
  }
  const job = (data as JobRow[] | null)?.[0];
  if (!job) return null;

  const controller = new AbortController();
  try {
    if (job.kind !== "generate_report") throw new JobFailure("kind_unsupported");
    const status = await runGenerate(job, controller);
    await finish(job.id, status, null);
  } catch (e) {
    const f = failureOf(e);
    console.error("job", job.id, f.code);
    await finish(job.id, f.status, f.code);
  }
  return job.id;
}

/** Vide la file dans la limite de temps donnée (appel depuis after() ou le cron). */
export async function drainQueue(workerId: string, deadlineMs: number): Promise<number> {
  let n = 0;
  while (Date.now() < deadlineMs) {
    const id = await runOneJob(workerId);
    if (!id) break;
    n++;
  }
  return n;
}
