/**
 * Worker de génération : réserve une tâche (bail), exécute le pipeline, enregistre
 * connaissance, preuves, version et consommation. Aucun contenu privé dans les codes
 * d'erreur ni dans les journaux.
 */
import "server-only";
import { siteUrl } from "@/lib/site";
import { selectAll } from "@/lib/supabase/paginate";
import { createHash } from "node:crypto";
import { z } from "zod";
import { activeProvider, limits } from "@/lib/config";
import {
  Evidence,
  ExplanationObject,
  KnowledgeObject,
  PreferencesSnapshot,
  ReportBlueprint,
  SourceSegment,
  TemplateId,
  type ExerciseSet,
  type Goal,
  type Level,
  type Mode,
  type VisualMode,
} from "@/lib/contracts/schemas";
import { priceBasisFor, usageCents } from "@/lib/budget";
import { assertBudget, BudgetError } from "./budget-guard";
import { CREDIT_RETURNED, recordLimitEvent } from "./limits";
import { getImageProvider, getProvider } from "@/lib/engine";
import { realisticPrompt, vectorPrompt } from "@/lib/visuals/recraft";
import { svgLibrary } from "@/lib/visuals/svg-library";
import { sanitizeSvg, svgSize } from "@/lib/visuals/svg";
import { generateExercises } from "@/lib/engine/exercises";
import {
  PROMPT_VERSION,
  regenerateExplanation,
  regenerateSection,
  reverifyKnowledge,
  type GenerationOutput,
  type ReformulateReason,
  type Variation,
} from "@/lib/engine/pipeline";
import { carryIllustrations, illustrate, pendingIllustrations, type AssetRow, type IllustrateDeps } from "@/lib/visuals/illustrate";
import { diagramPrompt, imageSettingsFrom, modelInfo, type ImageProviderId, type ImageSettings } from "@/lib/visuals/image-models";
import { jobStore } from "./checkpoints";
import { generateV5, PlanCheckpoint } from "@/lib/engine/v5";
import { checkImage } from "@/lib/visuals/sources";
import { ProviderError, type UsageReport } from "@/lib/engine/provider";
import { finishJobReservation } from "@/lib/billing/wallet";
import { chooseCover } from "@/lib/library/cover-gen";
import { notify } from "@/lib/notifications";
import { assemble, ExtractionError } from "@/lib/extract";
import { engineEvidence, engineSegments, storedEvidence } from "@/lib/reports/source-set";
import { OCR_MIME, ocrDocument } from "@/lib/extract/ocr";
import { BUCKET, purgeDate, purgeOriginal } from "@/lib/sources/uploads";
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
    target_pages: number;
    /** Approche choisie (V4) ; absente : explication claire. */
    mode?: Mode;
    /** Langue des explications (null : celle de la source). */
    language?: "fr" | "en" | null;
    /** « Essayer une autre formulation » : motifs et remarque du lecteur. */
    reasons?: ReformulateReason[];
    comment?: string | null;
    ocr?: boolean;
    /** Limpid commun (V5) : documents dans l'ordre de lecture (absent : source unique). */
    source_ids?: string[];
    /** Documents à lire par OCR dans la tâche (absent : `ocr` vaut pour la source unique). */
    ocr_sources?: string[];
    /** Organisation imposée par le lecteur. */
    template?: z.infer<typeof TemplateId>;
    /** Nouvelle version d'un rapport existant. */
    variation?: Variation;
    base_version_id?: string;
    /** Section à réécrire seule (sinon tout le rapport). */
    section_id?: string;
    /** Visuels permis (absent : auto). */
    visual_mode?: VisualMode;
  };
}

const CHANGE_REASON: Record<Variation, string> = {
  simpler: "plus_simple",
  other_example: "autre_exemple",
  mode: "autre_approche",
  reformulate: "autre_formulation",
};
const SECTION_CHANGE_REASON: Record<Variation, string> = {
  simpler: "section_plus_simple",
  other_example: "section_autre_exemple",
  mode: "autre_approche",
  reformulate: "autre_formulation",
};

const EXERCISE_BUDGET = { tier: "quality" as const, maxInputTokens: 60_000, maxOutputTokens: 24_000, timeoutMs: 150_000, reasoning: "low" as const };

/**
 * Exercices du support (points de contrôle et bilan), rédigés une fois avec la version.
 * Un échec n'empêche jamais le rapport : le lecteur pourra demander un test plus tard.
 */
/** Exercices du support ; un échec laisse le rapport sans exercices (jamais bloquant). */
async function prepareExercises(job: JobRow, explanation: ExplanationObject, knowledge: KnowledgeObject, evidenceIds: Set<string>, controller: AbortController): Promise<ExerciseSet | null> {
  try {
    return await generateExercises(getProvider(), {
      explanation,
      knowledge,
      evidenceIds,
      mode: explanation.mode ?? job.params.mode ?? "claire",
      language: job.params.language ?? null,
      budget: EXERCISE_BUDGET,
      signal: controller.signal,
      onUsage: (u) => recordUsage(job, "exercises", 0, u),
    });
  } catch (e) {
    if (e instanceof ProviderError && e.usage) await recordUsage(job, "exercises", 0, e.usage);
    console.error("exercises", e instanceof ProviderError ? e.code : (e as Error).name);
    return null;
  }
}

async function saveExercises(job: JobRow, versionId: string, set: ExerciseSet | null) {
  if (!set) return;
  await adminClient()
    .from("report_quizzes")
    .upsert({ owner_id: job.owner_id, report_version_id: versionId, scope_key: "exercises", questions: set }, { onConflict: "report_version_id,scope_key" });
}

async function storeExercises(job: JobRow, versionId: string, explanation: ExplanationObject, knowledge: KnowledgeObject, evidenceIds: Set<string>, controller: AbortController) {
  await saveExercises(job, versionId, await prepareExercises(job, explanation, knowledge, evidenceIds, controller));
}

/** Au-delà de cette durée après la réservation, la génération repart dans une nouvelle invocation. */
const REQUEUE_AFTER_MS = 120_000;
/** Fenêtre de génération d'une invocation (fonction de 300 s) : aucun appel long lancé au-delà. */
const GENERATION_WINDOW_MS = 270_000;
/** Cours prêt plus tard que cela : illustrations et exercices dans une nouvelle invocation. */
const REQUEUE_BEFORE_VISUALS_MS = 120_000;

/** Modèles réellement utilisés : lecture (compréhension) et rédaction (chapitres), pour l'étiquette. */
async function jobModels(jobId: string): Promise<{ reading: string | null; writing: string | null }> {
  const { data } = await adminClient().from("usage_ledger").select("stage, model").eq("job_id", jobId);
  const of = (test: (stage: string) => boolean) => [...new Set((data ?? []).filter((r) => test(r.stage as string)).map((r) => r.model as string))];
  const reading = of((x) => x === "comprehension")[0] ?? null;
  const writing = of((x) => x.startsWith("chapitre_") || x === "explication").join(" + ").slice(0, 200) || null;
  return { reading, writing };
}

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


/** Segments de tous les documents du Limpid, dans l'ordre de lecture, identifiants du moteur. */
async function loadSourceSet(sourceIds: string[]): Promise<SourceSegment[]> {
  const db = adminClient();
  const bySource = await Promise.all(
    sourceIds.map(async (sourceId) => {
      const { data, error } = await selectAll((from, to) =>
        db
          .from("source_segments")
          .select("id, source_version, locator, text, content_hash, extraction_warnings, ordinal")
          .eq("source_id", sourceId)
          .order("ordinal")
          .range(from, to),
      );
      if (error || !data?.length) throw new JobFailure("source_missing");
      return { sourceId, rows: data };
    }),
  );
  return engineSegments(bySource);
}

/** Documents du Limpid : paramètres de la tâche, sinon ensemble enregistré, sinon source unique. */
async function jobSourceIds(job: JobRow): Promise<string[]> {
  if (job.params.source_ids?.length) return job.params.source_ids;
  if (job.report_id) {
    const { data } = await adminClient().from("report_sources").select("source_id, position").eq("report_id", job.report_id).order("position");
    if (data?.length) return data.map((r) => r.source_id as string);
  }
  if (!job.source_id) throw new JobFailure("job_invalid");
  return [job.source_id];
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
  const cents = usageCents(u);
  const known = u.inputTokens !== null || typeof u.costUsd === "number";
  await adminClient().from("usage_ledger").upsert(
    {
      owner_id: job.owner_id,
      job_id: job.id,
      stage,
      attempt,
      provider: u.provider,
      model: u.model,
      status: known ? "settled" : "uncertain",
      reserved_cents: cents,
      actual_cents: known ? cents : null,
      input_tokens: u.inputTokens,
      output_tokens: u.outputTokens,
      duration_ms: u.durationMs,
      provider_request_id: u.requestId,
      price_basis: priceBasisFor(u),
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

/**
 * Lecture OCR d'un document dans la tâche. Document entièrement visuel (image, PDF scanné) :
 * toutes les pages. Document mixte : seules les pages sans texte natif (schémas, pages
 * scannées) sont lues, puis rejoignent leur place dans l'ordre des pages. Déjà lu : rien.
 */
async function runOcr(job: JobRow, sourceId: string, controller: AbortController) {
  const db = adminClient();
  const { data: src } = await db.from("sources").select("kind, storage_path, page_count, coverage").eq("id", sourceId).single();
  const coverage = (src?.coverage ?? {}) as Record<string, unknown> & { pending_ocr?: boolean; pending_ocr_pages?: number[] };
  const pages = Array.isArray(coverage.pending_ocr_pages) ? coverage.pending_ocr_pages.filter((n) => Number.isInteger(n) && n >= 1) : null;
  if (!pages) {
    const { count } = await db.from("source_segments").select("id", { count: "exact", head: true }).eq("source_id", sourceId);
    if ((count ?? 0) > 0) return;
  } else if (pages.length === 0) return;

  await setStage(job.id, "extraction");
  await checkBudget(job.owner_id);
  if (!src?.storage_path || !(src.kind in OCR_MIME)) {
    // Document mixte dont l'original a disparu : on garde le texte natif, pages signalées.
    if (pages) return;
    throw new JobFailure("ocr_source_missing");
  }
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
        pages: pages ?? undefined,
        signal: controller.signal,
        budget: { tier: "fast", maxInputTokens: 120_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
        onUsage: (stage, attempt, u) => recordUsage(job, stage, attempt, u),
      });
    } catch (e) {
      // Pages complémentaires illisibles : le texte natif reste, les pages restent signalées.
      if (e instanceof ExtractionError && pages) {
        await db.from("sources").update({ coverage: { ...coverage, pending_ocr_pages: [], ocr_unreadable_pages: pages } }).eq("id", sourceId);
        return;
      }
      if (e instanceof ExtractionError) throw new JobFailure("ocr_unreadable");
      throw e;
    }

    if (pages) {
      // Pages lues en complément : segments propres, identifiants distincts du texte natif.
      const { data: first } = await db.from("source_segments").select("source_version").eq("source_id", sourceId).limit(1).maybeSingle();
      const out = assemble(result.blocks, `src_${sourceId}`, { maxChars: limits.maxSourceChars, pageCount, pagesRead: pageCount, emptyPages: [], ocr: true });
      const perPage = new Map<number, number>();
      const rows = out.extracted.segments.map((seg, i) => {
        const page = (seg.locator as { physical_index?: number }).physical_index ?? 0;
        const k = (perPage.get(page) ?? 0) + 1;
        perPage.set(page, k);
        return {
          id: `seg_p${page}-${k}`,
          source_id: sourceId,
          owner_id: job.owner_id,
          // Même version de source que le texte natif : une seule version figée du document.
          source_version: first?.source_version ?? seg.source_version,
          ordinal: 100_000 + i,
          locator: seg.locator,
          text: seg.text,
          content_hash: seg.content_hash,
          extraction_warnings: seg.extraction_warnings,
        };
      });
      if (rows.length) {
        const ins = await db.from("source_segments").upsert(rows, { onConflict: "source_id,id", ignoreDuplicates: true });
        if (ins.error) throw new JobFailure("persist_segments");
      }
      // Remarques de couverture à jour : les pages lues ne sont plus « sans texte ».
      const notes = ((coverage.notes as string[] | undefined) ?? []).filter((n) => !n.startsWith("Pages sans texte lisible"));
      if (result.unreadablePages.length) notes.push(`Pages illisibles, même lues comme des images : ${result.unreadablePages.join(", ")}.`);
      notes.push(`Pages lues comme des images (OCR) : ${pages.join(", ")}.`);
      await db
        .from("sources")
        .update({
          coverage: { ...coverage, notes: notes.slice(0, 10), empty_pages: result.unreadablePages, pending_ocr_pages: [], ocr_pages: pages, partial: result.unreadablePages.length > 0 },
        })
        .eq("id", sourceId);
      return;
    }

    const out = assemble(result.blocks, `src_${sourceId}`, {
      maxChars: limits.maxSourceChars,
      pageCount: kind === "pdf" ? pageCount : null,
      pagesRead: kind === "pdf" ? result.pagesRead : null,
      emptyPages: kind === "pdf" ? result.unreadablePages : [],
      ocr: true,
    });
    const segs = await db.from("source_segments").insert(
      out.extracted.segments.map((seg, i) => ({
        id: seg.id,
        source_id: sourceId,
        owner_id: job.owner_id,
        source_version: seg.source_version,
        ordinal: i,
        locator: seg.locator,
        text: seg.text,
        content_hash: seg.content_hash,
        extraction_warnings: seg.extraction_warnings,
      })),
    );
    if (segs.error) throw new JobFailure("persist_segments");
    await db
      .from("sources")
      .update({
        status: out.coverage.partial ? "partial" : "extracted",
        content_hash: out.extracted.sourceVersion,
        // Document entièrement lu comme des images : compté en pages OCR dans l'administration.
        coverage: { ...out.coverage, ocr_all: true },
      })
      .eq("id", sourceId);
    // Lu : l'original reste consultable jusqu'à la suppression du Limpid (aucune échéance).
    await db.from("sources").update({ original_purge_at: purgeDate() }).eq("id", sourceId);
  } catch (e) {
    // Échec de lecture d'un document entièrement visuel : l'original n'est pas gardé.
    if (!pages) await purgeOriginal(sourceId, src.storage_path);
    throw e;
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

/**
 * Relance immédiate (plan Hobby, 300 s par exécution) : une tâche remise en file repart aussitôt
 * dans une nouvelle exécution du worker, sans attendre le suivi de la page ni le cron. L'appel
 * n'attend que l'acceptation (202) ; la réservation atomique empêche tout double traitement.
 */
export async function relayWorker(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) return false;
  const res = await fetch(`${siteUrl(env)}/api/worker`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(5_000),
    cache: "no-store",
  }).catch(() => null);
  return !!res && res.status === 202;
}

async function runGenerate(job: JobRow, controller: AbortController, claimedAt: number): Promise<string> {
  if (!job.source_id || !job.report_id) throw new JobFailure("job_invalid");
  const db = adminClient();
  const sourceIds = await jobSourceIds(job);
  const ocrTargets = job.params.ocr_sources ?? (job.params.ocr ? [job.source_id] : []);
  // Documents mixtes : pages sans texte natif à compléter (marquées à l'import).
  const { data: mixed } = await db.from("sources").select("id, coverage").in("id", sourceIds);
  for (const m of mixed ?? []) {
    const p = (m.coverage as { pending_ocr_pages?: number[] } | null)?.pending_ocr_pages;
    if (Array.isArray(p) && p.length && !ocrTargets.includes(m.id)) ocrTargets.push(m.id);
  }
  if (ocrTargets.length) {
    for (const id of sourceIds.filter((x) => ocrTargets.includes(x))) await runOcr(job, id, controller);
    // Lecture longue : la génération repart avec un budget de temps complet.
    if (Date.now() - claimedAt > REQUEUE_AFTER_MS) {
      await requeue(job.id);
      return "requeued";
    }
  }
  await setStage(job.id, "validation");
  await checkBudget(job.owner_id);
  const segments = await loadSourceSet(sourceIds);
  const preferences = await preferencesOf(job.owner_id);
  const provider = getProvider();

  const input = {
    sourceId: `src_${sourceIds[0]}`,
    sourceIds: sourceIds.map((id) => `src_${id}`),
    segments,
    level: job.params.level,
    goal: job.params.goal,
    targetPages: job.params.target_pages,
    mode: job.params.mode ?? "claire",
    language: job.params.language ?? null,
    preferences,
    signal: controller.signal,
    // Niveaux par défaut (3.8 Flash) ; le moteur passe un chapitre difficile au modèle Pro.
    budgets: {
      comprehension: { tier: "fast" as const, maxInputTokens: 120_000, maxOutputTokens: 32_000, timeoutMs: 180_000, reasoning: "low" as const },
      explanation: { tier: "fast" as const, maxInputTokens: 120_000, maxOutputTokens: 16_000, timeoutMs: 170_000 },
      plan: { tier: "fast" as const, maxInputTokens: 200_000, maxOutputTokens: 24_000, timeoutMs: 150_000, reasoning: "low" as const },
    },
    onStage: (stage: "comprehension" | "explication" | "verification" | "plan") => setStage(job.id, stage),
    onUsage: (stage: string, attempt: number, u: UsageReport) => recordUsage(job, stage, attempt, u),
    verifyClaims: process.env.LIMPID_VERIFY_CLAIMS !== "off",
    template: job.params.template ?? null,
    visualMode: job.params.visual_mode ?? "auto",
  };

  // Moteur V5 : lecture (par fragments si besoin), plan, chapitres en parallèle. Chaque étape
  // validée est enregistrée ; près du délai de la fonction, la tâche repart dans une nouvelle
  // invocation qui reprend où elle s'était arrêtée, sans refaire ni repayer.
  const store = jobStore(job.id);
  // Publication progressive : dès que les chapitres 1 à k sont rédigés, le cours est lisible.
  const publishAs = (out: GenerationOutput, final: boolean) =>
    publishVersion(job, out, { provider: provider.name, sourceVersion: segments[0]!.source_version, sourceIds, final });
  const result = await generateV5(provider, input, {
    store,
    deadline: claimedAt + GENERATION_WINDOW_MS,
    onPartial: async (out) => {
      await publishAs(out, false);
    },
  });
  if (result.status === "paused") {
    await requeue(job.id);
    return "requeued";
  }
  const out = result.output;
  const versionId = await publishAs(out, true);

  // Finitions après publication (le cours est déjà lisible) : illustrations et exercices.
  if (Date.now() - claimedAt > REQUEUE_BEFORE_VISUALS_MS) {
    await requeue(job.id);
    return "requeued";
  }
  const evidenceIds = new Set(out.evidence.map((e) => e.id));
  const [blueprint, exercises] = await Promise.all([
    runIllustrations(job, out.blueprint, controller),
    prepareExercises(job, out.explanation, out.knowledge, evidenceIds, controller),
  ]);
  await setStage(job.id, "mise_en_page");
  if (blueprint !== out.blueprint) {
    const upd = await db.from("report_versions").update({ blueprint }).eq("id", versionId);
    if (upd.error) throw new JobFailure("persist_version");
  }
  await saveExercises(job, versionId, exercises);
  return out.status === "validated" ? "succeeded" : "incomplete_check";
}

const Publication = z.object({ version_id: z.string().uuid(), knowledge_id: z.string().uuid(), final: z.boolean() });

/**
 * Publie le cours (kit V6, publication progressive) : la première fois, enregistre la
 * connaissance, les preuves et une version, puis en fait la version courante ; ensuite, met à
 * jour cette même version (chapitres suivants, puis cours complet). Idempotent à la reprise.
 */
async function publishVersion(
  job: JobRow,
  out: GenerationOutput,
  ctx: { provider: string; sourceVersion: string; sourceIds: string[]; final: boolean },
): Promise<string> {
  const db = adminClient();
  const store = jobStore(job.id);
  const previous = await store.load("publication", Publication);
  const models = await jobModels(job.id);
  const fields = {
    explanation: out.explanation,
    blueprint: out.blueprint,
    validation: out.validation.explanation,
    check_status: ctx.final && out.status === "validated" ? "validated" : "incomplete",
    template_id: out.blueprint.template_id,
    mode: out.explanation.mode ?? null,
    model: models.writing ?? null,
  };
  let versionId: string;
  if (previous) {
    versionId = previous.version_id;
    // Cours déjà complet (reprise des finitions) : rien à republier.
    if (previous.final) return versionId;
    const upd = await db.from("report_versions").update(fields).eq("id", versionId);
    if (upd.error) throw new JobFailure("persist_version");
  } else {
    const ko = await db
      .from("knowledge_objects")
      .insert({
        owner_id: job.owner_id,
        source_id: job.source_id,
        source_version: ctx.sourceVersion,
        schema_version: out.knowledge.schema_version,
        prompt_version: PROMPT_VERSION,
        model: models.reading ?? ctx.provider,
        body: out.knowledge,
        validation: out.validation.knowledge,
      })
      .select("id")
      .single();
    if (ko.error || !ko.data) throw new JobFailure("persist_knowledge");
    if (out.evidence.length) {
      const ev = await db.from("evidence").insert(
        out.evidence.map((e) => {
          const stored = storedEvidence(e, ctx.sourceIds);
          return {
            id: e.id,
            knowledge_id: ko.data.id,
            owner_id: job.owner_id,
            source_id: stored.source_id,
            segment_id: stored.segment_id,
            start_offset: e.start_offset,
            end_offset: e.end_offset,
            quote: e.quote,
          };
        }),
      );
      if (ev.error) throw new JobFailure("persist_evidence");
    }
    const { count } = await db.from("report_versions").select("id", { count: "exact", head: true }).eq("report_id", job.report_id);
    const version = await db
      .from("report_versions")
      .insert({
        ...fields,
        report_id: job.report_id,
        owner_id: job.owner_id,
        version_number: (count ?? 0) + 1,
        knowledge_id: ko.data.id,
        level: job.params.level,
        goal: job.params.goal,
        target_pages: job.params.target_pages,
        change_reason: "generation_initiale",
        provider: ctx.provider,
        prompt_version: PROMPT_VERSION,
      })
      .select("id")
      .single();
    // Le trigger refuse l'écriture si le rapport a été supprimé entre-temps.
    if (version.error || !version.data) throw new JobFailure("persist_version");
    versionId = version.data.id;
    await store.save("publication", { version_id: versionId, knowledge_id: ko.data.id, final: false });
  }
  const rep = await db
    .from("reports")
    .update({ current_version_id: versionId, title: out.blueprint.title.slice(0, 300), mode: out.explanation.mode ?? null })
    .eq("id", job.report_id!)
    .is("deleted_at", null);
  if (rep.error) throw new JobFailure("persist_report");
  if (ctx.final) {
    const pub = await store.load("publication", Publication);
    if (pub) await store.save("publication", { ...pub, final: true });
  }
  return versionId;
}

/** Réglages d'images de la console admin (fournisseur et modèle par type de visuel). */
async function imageSettings(): Promise<ImageSettings> {
  const { data } = await adminClient()
    .from("app_settings")
    .select("images_enabled, image_illustration_provider, image_illustration_model, image_vector_provider, image_vector_model, image_realistic_provider, image_realistic_model, image_diagram_provider, image_diagram_model")
    .maybeSingle();
  return imageSettingsFrom(data as Record<string, unknown> | null);
}

/** Modèles d'image utilisables : tous servis par OpenRouter (Recraft, Seedream, Nano Banana). */
function imageProviders(): Record<ImageProviderId, boolean> {
  const on = activeProvider() === "openrouter";
  return { recraft: on, seedream: on, nanobanana: on || activeProvider() === "gemini" };
}

/** Illustrations prévues par le plan (0–1 par chapitre, 3 au plus) ; un échec n'arrête jamais le cours. */
async function runIllustrations(job: JobRow, blueprint: ReportBlueprint, controller: AbortController): Promise<ReportBlueprint> {
  if (!job.report_id || pendingIllustrations(blueprint).length === 0) return blueprint;
  await setStage(job.id, "illustrations");
  const db = adminClient();
  const reportId = job.report_id;
  const deps: IllustrateDeps = {
    settings: await imageSettings(),
    available: imageProviders(),
    render: async (route, style, item) => {
      // Plafonds vérifiés avant chaque image ; un refus laisse le cours sans image.
      await checkBudget(job.owner_id);
      const prompt =
        style === "diagram"
          ? diagramPrompt(item.subject, item.altText, item.content)
          : style === "realistic"
            ? realisticPrompt(item.subject, item.purpose, item.altText)
            : vectorPrompt(item.subject, item.purpose, item.altText);
      // Schéma : portrait 3/4 pour l'écran du téléphone.
      const out = await getImageProvider().generateIllustration({ model: route.model, prompt, aspectRatio: style === "diagram" ? "3:4" : "4:3", signal: controller.signal, timeoutMs: 90_000 });
      if (out.mime === "image/svg+xml" || modelInfo(route.model)?.output === "svg") {
        // SVG nettoyé avant stockage : aucun script, lien externe ni gestionnaire d'événement.
        let svg: string;
        try {
          svg = sanitizeSvg(out.bytes.toString("utf8"));
        } catch {
          throw new ProviderError("empty", "SVG inexploitable.", out.usage);
        }
        const bytes = Buffer.from(svg, "utf8");
        const { width, height } = svgSize(svg);
        return { image: { bytes, mime: "image/svg+xml" as const, width, height, sha256: createHash("sha256").update(bytes).digest("hex") }, usage: out.usage };
      }
      const image = checkImage(out.bytes);
      if (!image) throw new ProviderError("empty", "Image inexploitable.", out.usage);
      return { image, usage: out.usage };
    },
    library: svgLibrary(db),
    onUsage: (route, attempt, u) => recordUsage(job, `illustrations_${route.provider}`, attempt, u),
    store: async (img, ext) => {
      const path = `${job.owner_id}/${reportId}/assets/${crypto.randomUUID()}.${ext}`;
      const { error } = await db.storage.from("exports").upload(path, img.bytes, { contentType: img.mime, upsert: false });
      return error ? null : path;
    },
    insertAsset: async (row: AssetRow) => {
      const { data, error } = await db
        .from("visual_assets")
        .insert({ ...row, owner_id: job.owner_id, report_id: reportId })
        .select("id")
        .single();
      if (error && row.storage_path) await db.storage.from("exports").remove([row.storage_path]);
      return error ? null : data.id;
    },
  };
  try {
    return (await illustrate(blueprint, job.params.visual_mode ?? "auto", deps)).blueprint;
  } catch (e) {
    if (e instanceof JobFailure) throw e; // annulation ou budget
    // Repli : sans illustration, le cours reste complet.
    return (await illustrate(blueprint, "aucun", deps)).blueprint;
  }
}

/** Nouvelle version (« Plus simple », « Un autre exemple ») à partir de la connaissance validée. */
/** Enregistre une connaissance revérifiée (nouvel objet, mêmes preuves recopiées). */
async function persistKnowledge(
  job: JobRow,
  knowledge: KnowledgeObject,
  evidence: Evidence[],
  sourceVersion: string,
  previousId: string,
  sourceIds: string[],
): Promise<string> {
  const db = adminClient();
  const { data: prev } = await db.from("knowledge_objects").select("validation, model").eq("id", previousId).single();
  const ko = await db
    .from("knowledge_objects")
    .insert({
      owner_id: job.owner_id,
      source_id: job.source_id,
      source_version: sourceVersion,
      schema_version: knowledge.schema_version,
      prompt_version: PROMPT_VERSION,
      model: prev?.model ?? "inconnu",
      body: knowledge,
      validation: prev?.validation ?? {},
    })
    .select("id")
    .single();
  if (ko.error || !ko.data) throw new JobFailure("persist_knowledge");
  if (evidence.length) {
    const ev = await db.from("evidence").insert(
      evidence.map((e) => ({ ...storedEvidence(e, sourceIds), knowledge_id: ko.data.id, owner_id: job.owner_id })),
    );
    if (ev.error) throw new JobFailure("persist_evidence");
  }
  return ko.data.id;
}

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
    db.from("evidence").select("id, segment_id, source_id, start_offset, end_offset, quote").eq("knowledge_id", base.knowledge_id),
  ]);
  if (!ko) throw new JobFailure("version_missing");
  let knowledge = KnowledgeObject.parse(ko.body);
  // Preuves stockées (source, segment local) → identifiants du moteur pour l'ensemble de sources.
  const sourceIds = await jobSourceIds(job);
  const evidence = (ev ?? []).map((e) => {
    const { source_id: _s, ...row } = engineEvidence(e, sourceIds);
    return Evidence.parse(row);
  });
  const previous = ExplanationObject.parse(base.explanation);
  const provider = getProvider();

  const generation = {
    level: job.params.level,
    goal: job.params.goal,
    targetPages: job.params.target_pages,
    mode: job.params.mode ?? previous.mode ?? "claire",
    language: job.params.language ?? null,
    preferences: await preferencesOf(job.owner_id),
    signal: controller.signal,
    budgets: {
      comprehension: { tier: "fast" as const, maxInputTokens: 120_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
      explanation: { tier: "quality" as const, maxInputTokens: 120_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
    },
    onStage: (stage: "comprehension" | "explication" | "verification" | "plan") => setStage(job.id, stage),
    onUsage: (stage: string, attempt: number, u: UsageReport) => recordUsage(job, stage, attempt, u),
  };
  const sectionId = job.params.section_id;
  const baseBlueprint = ReportBlueprint.parse(base.blueprint);
  // Information signalée comme incorrecte : la connaissance est d'abord confrontée à la source.
  let knowledgeId = base.knowledge_id;
  if (variation === "reformulate" && job.params.reasons?.includes("incorrect") && job.source_id) {
    const segments = await loadSourceSet(sourceIds);
    knowledge = await reverifyKnowledge(provider, { ...generation, segments }, knowledge, evidence);
    knowledgeId = await persistKnowledge(job, knowledge, evidence, segments[0]!.source_version, base.knowledge_id, sourceIds);
  }
  const regenerated = sectionId
    ? await regenerateSection(provider, generation, knowledge, evidence, previous, baseBlueprint, sectionId, variation)
    : await regenerateExplanation(provider, generation, knowledge, evidence, previous, variation, {
        reasons: job.params.reasons,
        comment: job.params.comment ?? null,
      });
  // Les illustrations déjà choisies sont reprises : pas de nouvelle recherche ni d'image générée.
  const carried = sectionId ? regenerated : { ...regenerated, blueprint: carryIllustrations(baseBlueprint, regenerated.blueprint) };
  // V5 : aucun dessin tracé par le code ; les anciens dessins ne sont pas recopiés.
  const drawings = new Set(carried.blueprint.visual_specs.filter((v) => v.kind === "drawing").map((v) => v.id));
  const out = {
    ...carried,
    blueprint: {
      ...carried.blueprint,
      visual_specs: carried.blueprint.visual_specs.filter((v) => !drawings.has(v.id)),
      sections: carried.blueprint.sections.map((x) => ({ ...x, visual_ids: x.visual_ids.filter((id) => !drawings.has(id)) })),
    },
  };

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
      knowledge_id: knowledgeId,
      level: job.params.level,
      goal: job.params.goal,
      template_id: out.blueprint.template_id,
      target_pages: job.params.target_pages,
      explanation: out.explanation,
      blueprint: out.blueprint,
      validation: out.validation,
      check_status: out.status === "validated" ? "validated" : "incomplete",
      change_reason: (sectionId ? SECTION_CHANGE_REASON : CHANGE_REASON)[variation],
      mode: out.explanation.mode ?? null,
      provider: provider.name,
      model: model ?? null,
      prompt_version: PROMPT_VERSION,
    })
    .select("id")
    .single();
  if (version.error || !version.data) throw new JobFailure("persist_version");
  if (!sectionId) await storeExercises(job, version.data.id, out.explanation, knowledge, new Set(evidence.map((e) => e.id)), controller);
  const rep = await db
    .from("reports")
    .update({ current_version_id: version.data.id, mode: out.explanation.mode ?? null })
    .eq("id", job.report_id)
    .is("deleted_at", null);
  if (rep.error) throw new JobFailure("persist_report");
  return out.status === "validated" ? "succeeded" : "incomplete_check";
}

/**
 * Écarts au schéma de la dernière réponse (chemins et règles, jamais le contenu) : seule trace
 * permettant de comprendre un échec « hors schéma » après coup. Lisible dans l'administration.
 */
async function recordSchemaIssues(job: JobRow, e: ProviderError) {
  await adminClient()
    .from("audit_log")
    .insert({
      actor_id: job.owner_id,
      action: "job.schema_mismatch",
      target_kind: "job",
      target_id: job.id,
      meta: { kind: job.kind, model: e.usage?.model ?? null, issues: e.issues.slice(0, 10).map((x) => x.slice(0, 160)) },
    });
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
export async function runOneJob(workerId: string, deadlineMs = Date.now() + GENERATION_WINDOW_MS): Promise<{ id: string; requeued: boolean } | null> {
  const db = adminClient();
  const { data, error } = await db.rpc("claim_job", { p_worker: workerId, p_lease_seconds: WORKER_LEASE_SECONDS });
  if (error) {
    console.error("claim_job", error.code);
    return null;
  }
  const job = (data as JobRow[] | null)?.[0];
  if (!job) return null;

  const controller = new AbortController();
  // Deuxième tâche d'une même invocation : sa fenêtre se termine avec celle de l'invocation.
  const claimedAt = Math.min(Date.now(), deadlineMs - GENERATION_WINDOW_MS);
  try {
    let status: string;
    if (job.kind === "generate_report") status = await runGenerate(job, controller, claimedAt);
    else if (job.kind === "reexplain_section") status = await runReexplain(job, controller);
    else throw new JobFailure("kind_unsupported");
    if (status === "requeued") {
      if (!(await relayWorker())) console.error("worker.relay", job.id);
      return { id: job.id, requeued: true };
    }
    await finish(job.id, status, null);
    // Module livré : le prix réservé devient une consommation (une seule fois).
    await finishJobReservation(job.id, status === "succeeded" || status === "incomplete_check");
    if (job.report_id && (status === "succeeded" || status === "incomplete_check")) await afterDelivery(job, claimedAt);
  } catch (e) {
    const f = failureOf(e);
    // Message technique seulement (ex. « OpenRouter : erreur HTTP 403. »), jamais le contenu du document.
    console.error("job", job.id, f.code, e instanceof Error ? e.message.slice(0, 160) : "");
    await finish(job.id, f.status, f.code);
    // Échec ou annulation : les crédits réservés sont rendus à leurs lots d'origine.
    await finishJobReservation(job.id, false);
    if (e instanceof ProviderError && e.issues.length) await recordSchemaIssues(job, e);
    // Échec technique ou annulation d'un nouveau rapport : le crédit du jour est rendu.
    if (job.kind === "generate_report" && job.report_id) await recordLimitEvent(job.owner_id, CREDIT_RETURNED, job.report_id);
    if (job.report_id && f.status !== "cancelled") {
      await notify(job.owner_id, "report_failed", `job:${job.id}:failed`, { reportId: job.report_id, data: { code: f.code } }).catch(() => undefined);
    }
  }
  return { id: job.id, requeued: false };
}

/**
 * Après une livraison : notification « prête », puis couverture pour un nouveau Limpid qui n'en
 * a pas encore : illustration Pixabay, sinon image Gemini (un échec ne change rien).
 */
async function afterDelivery(job: JobRow, claimedAt: number) {
  const reportId = job.report_id!;
  const db = adminClient();
  const { data: report } = await db
    .from("reports")
    .select("title, cover_path, cover_url")
    .eq("id", reportId)
    .maybeSingle();
  await notify(job.owner_id, "report_ready", `job:${job.id}:ready`, { reportId, data: { title: report?.title ?? null } }).catch(() => undefined);
  if (job.kind !== "generate_report" || !report || report.cover_path || report.cover_url) return;
  // Mots-clés anglais prévus par le plan pour la couverture (thème du document).
  const plan = await jobStore(job.id).load("plan", PlanCheckpoint).catch(() => null);
  // Image Gemini (jusqu'à 90 s) seulement s'il reste le temps dans l'invocation ; sinon Pixabay seul.
  const generated = Date.now() - claimedAt < 170_000;
  await chooseCover({ reportId, ownerId: job.owner_id, title: report.title as string, query: plan?.plan.cover_query_en ?? "", jobId: job.id, generated }).catch((e) =>
    console.error("cover", (e as Error).message),
  );
}

/** Vide la file dans la limite de temps donnée (appel depuis after() ou le cron). */
export async function drainQueue(workerId: string, deadlineMs: number): Promise<number> {
  let n = 0;
  // Une nouvelle tâche seulement s'il reste au moins une minute à l'invocation.
  while (deadlineMs - Date.now() > 60_000) {
    const done = await runOneJob(workerId, deadlineMs);
    if (!done) break;
    n++;
    // Une tâche remise en file repart dans une autre invocation (relancée par le suivi).
    if (done.requeued) break;
  }
  return n;
}
