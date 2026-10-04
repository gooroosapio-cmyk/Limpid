/**
 * Worker de génération : réserve une tâche (bail), exécute le pipeline, enregistre
 * connaissance, preuves, version et consommation. Aucun contenu privé dans les codes
 * d'erreur ni dans les journaux.
 */
import "server-only";
import type { z } from "zod";
import { limits } from "@/lib/config";
import {
  Evidence,
  ExplanationObject,
  KnowledgeObject,
  PreferencesSnapshot,
  ReportBlueprint,
  SourceSegment,
  TemplateId,
  type Goal,
  type Level,
} from "@/lib/contracts/schemas";
import { estimateCents, PRICE_BASIS } from "@/lib/budget";
import { assertBudget, BudgetError } from "./budget-guard";
import { CREDIT_RETURNED, recordLimitEvent } from "./limits";
import { getProvider } from "@/lib/engine";
import { generateReport, PROMPT_VERSION, regenerateExplanation, regenerateSection, type Variation } from "@/lib/engine/pipeline";
import { ProviderError, type UsageReport } from "@/lib/engine/provider";
import { assemble, ExtractionError } from "@/lib/extract";
import { OCR_MIME, ocrDocument } from "@/lib/extract/ocr";
import { BUCKET, purgeOriginal } from "@/lib/sources/uploads";
import { adminClient } from "@/lib/supabase/admin";
import type { JobStage } from "./state";

export const WORKER_LEASE_SECONDS = 300;

interface JobRow {
  id: string;
  owner_id: string;
  report_id: string | null;
  source_id: string | null;
  kind: string;
  params: {
    level: Level;
    goal: Goal;
    target_pages: 5 | 7 | 12;
    ocr?: boolean;
    /** Organisation imposée par le lecteur. */
    template?: z.infer<typeof TemplateId>;
    /** Nouvelle version d'un rapport existant. */
    variation?: Variation;
    base_version_id?: string;
    /** Section à réécrire seule (sinon tout le rapport). */
    section_id?: string;
  };
}

const CHANGE_REASON: Record<Variation, string> = { simpler: "plus_simple", other_example: "autre_exemple" };
const SECTION_CHANGE_REASON: Record<Variation, string> = { simpler: "section_plus_simple", other_example: "section_autre_exemple" };

/** Au-delà de cette durée après la réservation, la génération repart dans une nouvelle invocation. */
const REQUEUE_AFTER_MS = 120_000;

class JobFailure extends Error {
  constructor(
    public readonly code: string,
    public readonly status: "failed" | "uncertain" | "cancelled" = "failed",
  ) {
    super(code);
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

/** Journal de consommation : une ligne par appel, sans double débit (clé tâche/étape/tentative). */
async function recordUsage(job: JobRow, stage: string, attempt: number, u: UsageReport) {
  const cents = estimateCents(u.inputTokens, u.outputTokens);
  await adminClient().from("usage_ledger").upsert(
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
}

/**
 * Étape de lecture OCR (images, PDF scannés) : le fichier conservé est envoyé à Gemini,
 * le texte obtenu devient les segments de la source, puis l'original est effacé.
 * Sans effet si les segments existent déjà (reprise après remise en file).
 */
async function checkBudget(ownerId: string) {
  try {
    await assertBudget(ownerId);
  } catch (e) {
    if (e instanceof BudgetError) throw new JobFailure(e.code);
    throw e;
  }
}

async function runOcr(job: JobRow, controller: AbortController) {
  const db = adminClient();
  const sourceId = job.source_id!;
  const { count } = await db.from("source_segments").select("id", { count: "exact", head: true }).eq("source_id", sourceId);
  if ((count ?? 0) > 0) return;

  await setStage(job.id, "extraction");
  await checkBudget(job.owner_id);
  const { data: src } = await db.from("sources").select("kind, storage_path, page_count").eq("id", sourceId).single();
  if (!src?.storage_path || !(src.kind in OCR_MIME)) throw new JobFailure("ocr_source_missing");
  const kind = src.kind as keyof typeof OCR_MIME;

  try {
    const file = await db.storage.from(BUCKET).download(src.storage_path);
    if (file.error || !file.data) throw new JobFailure("ocr_source_missing");
    const pageCount = kind === "pdf" ? (src.page_count ?? 1) : 1;
    let result;
    try {
      result = await ocrDocument(getProvider(), {
        kind: kind === "pdf" ? "pdf" : "image",
        mimeType: OCR_MIME[kind],
        data: new Uint8Array(await file.data.arrayBuffer()),
        pageCount,
        maxPages: limits.maxOcrPages,
        signal: controller.signal,
        budget: { tier: "fast", maxInputTokens: 120_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
        onUsage: (stage, attempt, u) => recordUsage(job, stage, attempt, u),
      });
    } catch (e) {
      if (e instanceof ExtractionError) throw new JobFailure("ocr_unreadable");
      throw e;
    }

    const out = assemble(result.blocks, `src_${sourceId}`, {
      maxChars: limits.maxSourceChars,
      pageCount: kind === "pdf" ? pageCount : null,
      pagesRead: kind === "pdf" ? result.pagesRead : null,
      emptyPages: kind === "pdf" ? result.unreadablePages : [],
      ocr: true,
    });
    const segs = await db.from("source_segments").insert(
      out.extracted.segments.map((s, i) => ({
        id: s.id,
        source_id: sourceId,
        owner_id: job.owner_id,
        source_version: s.source_version,
        ordinal: i,
        locator: s.locator,
        text: s.text,
        content_hash: s.content_hash,
        extraction_warnings: s.extraction_warnings,
      })),
    );
    if (segs.error) throw new JobFailure("persist_segments");
    await db
      .from("sources")
      .update({
        status: out.coverage.partial ? "partial" : "extracted",
        content_hash: out.extracted.sourceVersion,
        coverage: out.coverage,
      })
      .eq("id", sourceId);
  } finally {
    // Lu ou non, l'original ne reste pas : en cas d'échec, l'utilisateur l'enverra à nouveau.
    await purgeOriginal(sourceId, src.storage_path);
  }
}

/** Rend la tâche à la file : une nouvelle invocation reprendra après l'étape déjà faite. */
async function requeue(jobId: string) {
  await adminClient()
    .from("jobs")
    .update({ status: "queued", lease_owner: null, lease_expires_at: null })
    .eq("id", jobId)
    .eq("status", "running");
}

async function runGenerate(job: JobRow, controller: AbortController, claimedAt: number): Promise<string> {
  if (!job.source_id || !job.report_id) throw new JobFailure("job_invalid");
  const db = adminClient();
  if (job.params.ocr) {
    await runOcr(job, controller);
    // Lecture longue : la génération repart avec un budget de temps complet.
    if (Date.now() - claimedAt > REQUEUE_AFTER_MS) {
      await requeue(job.id);
      return "requeued";
    }
  }
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
    onUsage: (stage, attempt, u) => recordUsage(job, stage, attempt, u),
    verifyClaims: process.env.LIMPID_VERIFY_CLAIMS !== "off",
    template: job.params.template ?? null,
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

/** Nouvelle version (« Plus simple », « Un autre exemple ») à partir de la connaissance validée. */
async function runReexplain(job: JobRow, controller: AbortController): Promise<string> {
  const { variation, base_version_id: baseId } = job.params;
  if (!job.report_id || !variation || !baseId) throw new JobFailure("job_invalid");
  const db = adminClient();
  await setStage(job.id, "validation");
  await checkBudget(job.owner_id);

  const { data: base } = await db
    .from("report_versions")
    .select("id, knowledge_id, explanation, blueprint, template_id")
    .eq("id", baseId)
    .eq("report_id", job.report_id)
    .single();
  if (!base?.knowledge_id) throw new JobFailure("version_missing");
  const [{ data: ko }, { data: ev }] = await Promise.all([
    db.from("knowledge_objects").select("body").eq("id", base.knowledge_id).single(),
    db.from("evidence").select("id, segment_id, start_offset, end_offset, quote").eq("knowledge_id", base.knowledge_id),
  ]);
  if (!ko) throw new JobFailure("version_missing");
  const knowledge = KnowledgeObject.parse(ko.body);
  const evidence = (ev ?? []).map((e) => Evidence.parse(e));
  const previous = ExplanationObject.parse(base.explanation);
  const provider = getProvider();

  const generation = {
    level: job.params.level,
    goal: job.params.goal,
    targetPages: job.params.target_pages,
    preferences: await preferencesOf(job.owner_id),
    signal: controller.signal,
    budgets: {
      comprehension: { tier: "fast" as const, maxInputTokens: 120_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
      explanation: { tier: "quality" as const, maxInputTokens: 120_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
    },
    onStage: (stage: "comprehension" | "explication" | "verification") => setStage(job.id, stage),
    onUsage: (stage: string, attempt: number, u: UsageReport) => recordUsage(job, stage, attempt, u),
  };
  const sectionId = job.params.section_id;
  const out = sectionId
    ? await regenerateSection(provider, generation, knowledge, evidence, previous, ReportBlueprint.parse(base.blueprint), sectionId, variation)
    : await regenerateExplanation(provider, generation, knowledge, evidence, previous, variation);

  await setStage(job.id, "mise_en_page");
  const { count } = await db.from("report_versions").select("id", { count: "exact", head: true }).eq("report_id", job.report_id);
  const model = (await db.from("usage_ledger").select("model").eq("job_id", job.id).limit(1).maybeSingle()).data?.model;
  const version = await db
    .from("report_versions")
    .insert({
      report_id: job.report_id,
      owner_id: job.owner_id,
      version_number: (count ?? 0) + 1,
      parent_version_id: base.id,
      knowledge_id: base.knowledge_id,
      level: job.params.level,
      goal: job.params.goal,
      template_id: out.blueprint.template_id,
      target_pages: job.params.target_pages,
      explanation: out.explanation,
      blueprint: out.blueprint,
      validation: out.validation,
      check_status: out.status === "validated" ? "validated" : "incomplete",
      change_reason: (sectionId ? SECTION_CHANGE_REASON : CHANGE_REASON)[variation],
      provider: provider.name,
      model: model ?? null,
      prompt_version: PROMPT_VERSION,
    })
    .select("id")
    .single();
  if (version.error || !version.data) throw new JobFailure("persist_version");
  const rep = await db
    .from("reports")
    .update({ current_version_id: version.data.id })
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

/**
 * Réserve et exécute au plus une tâche. Renvoie l'identifiant traité (et s'il a été remis
 * en file), ou null si la file est vide.
 */
export async function runOneJob(workerId: string): Promise<{ id: string; requeued: boolean } | null> {
  const db = adminClient();
  const { data, error } = await db.rpc("claim_job", { p_worker: workerId, p_lease_seconds: WORKER_LEASE_SECONDS });
  if (error) {
    console.error("claim_job", error.code);
    return null;
  }
  const job = (data as JobRow[] | null)?.[0];
  if (!job) return null;

  const controller = new AbortController();
  const claimedAt = Date.now();
  try {
    let status: string;
    if (job.kind === "generate_report") status = await runGenerate(job, controller, claimedAt);
    else if (job.kind === "reexplain_section") status = await runReexplain(job, controller);
    else throw new JobFailure("kind_unsupported");
    if (status === "requeued") return { id: job.id, requeued: true };
    await finish(job.id, status, null);
  } catch (e) {
    const f = failureOf(e);
    console.error("job", job.id, f.code);
    await finish(job.id, f.status, f.code);
    // Échec technique ou annulation d'un nouveau rapport : le crédit du jour est rendu.
    if (job.kind === "generate_report" && job.report_id) await recordLimitEvent(job.owner_id, CREDIT_RETURNED, job.report_id);
  }
  return { id: job.id, requeued: false };
}

/** Vide la file dans la limite de temps donnée (appel depuis after() ou le cron). */
export async function drainQueue(workerId: string, deadlineMs: number): Promise<number> {
  let n = 0;
  while (Date.now() < deadlineMs) {
    const done = await runOneJob(workerId);
    if (!done) break;
    n++;
    // Une tâche remise en file repart dans une autre invocation (relancée par le suivi).
    if (done.requeued) break;
  }
  return n;
}
