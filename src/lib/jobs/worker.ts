/**
 * Worker de génération : réserve une tâche (bail), exécute le pipeline, enregistre
 * connaissance, preuves, version et consommation. Aucun contenu privé dans les codes
 * d'erreur ni dans les journaux.
 */
import "server-only";
import type { z } from "zod";
import { limits, retention } from "@/lib/config";
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
import { estimateCents, PRICE_BASIS } from "@/lib/budget";
import { assertBudget, BudgetError } from "./budget-guard";
import { CREDIT_RETURNED, recordLimitEvent } from "./limits";
import { getProvider } from "@/lib/engine";
import { GeminiProvider, geminiConfigFromEnv } from "@/lib/engine/gemini";
import { generateDrawings } from "@/lib/engine/drawings";
import { generateExercises } from "@/lib/engine/exercises";
import {
  generateReport,
  PROMPT_VERSION,
  regenerateExplanation,
  regenerateSection,
  reverifyKnowledge,
  type ReformulateReason,
  type Variation,
} from "@/lib/engine/pipeline";
import { visualConfig } from "@/lib/visuals/config";
import { carryIllustrations, illustrate, pendingIllustrations, type AssetRow } from "@/lib/visuals/illustrate";
import { downloadCommons, searchCommons, searchUnsplash, trackUnsplashDownload } from "@/lib/visuals/sources";
import { ProviderError, type UsageReport } from "@/lib/engine/provider";
import { assemble, ExtractionError } from "@/lib/extract";
import { engineEvidence, engineSegments, storedEvidence } from "@/lib/reports/source-set";
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

const EXERCISE_BUDGET = { tier: "quality" as const, maxInputTokens: 60_000, maxOutputTokens: 24_000, timeoutMs: 150_000 };
/** Planche de dessins : une génération, sortie courte. */
const DRAWING_BUDGET = { tier: "quality" as const, maxInputTokens: 40_000, maxOutputTokens: 12_000, timeoutMs: 120_000 };

/**
 * Exercices du support (points de contrôle et bilan), rédigés une fois avec la version.
 * Un échec n'empêche jamais le rapport : le lecteur pourra demander un test plus tard.
 */
async function storeExercises(job: JobRow, versionId: string, explanation: ExplanationObject, knowledge: KnowledgeObject, evidenceIds: Set<string>, controller: AbortController) {
  let set: ExerciseSet;
  try {
    set = await generateExercises(getProvider(), {
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
    return;
  }
  await adminClient()
    .from("report_quizzes")
    .upsert({ owner_id: job.owner_id, report_version_id: versionId, scope_key: "exercises", questions: set }, { onConflict: "report_version_id,scope_key" });
}

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


/** Segments de tous les documents du Limpid, dans l'ordre de lecture, identifiants du moteur. */
async function loadSourceSet(sourceIds: string[]): Promise<SourceSegment[]> {
  const db = adminClient();
  const bySource = await Promise.all(
    sourceIds.map(async (sourceId) => {
      const { data, error } = await db
        .from("source_segments")
        .select("id, source_version, locator, text, content_hash, extraction_warnings, ordinal")
        .eq("source_id", sourceId)
        .order("ordinal");
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
        coverage: out.coverage,
      })
      .eq("id", sourceId);
    // Lu : l'original reste consultable pendant la conservation du rapport.
    await db
      .from("sources")
      .update({ original_purge_at: new Date(Date.now() + retention.originalHours * 3600_000).toISOString() })
      .eq("id", sourceId);
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

  const out = await generateReport(provider, {
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
    budgets: {
      comprehension: { tier: "fast", maxInputTokens: 120_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
      explanation: { tier: "quality", maxInputTokens: 120_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
    },
    onStage: (stage) => setStage(job.id, stage),
    onUsage: (stage, attempt, u) => recordUsage(job, stage, attempt, u),
    verifyClaims: process.env.LIMPID_VERIFY_CLAIMS !== "off",
    template: job.params.template ?? null,
    visualMode: job.params.visual_mode ?? "auto",
  });
  const blueprint = await runIllustrations(job, await runDrawings(job, out.explanation, out.blueprint, controller), controller);

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
      out.evidence.map((e) => {
        const stored = storedEvidence(e, sourceIds);
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
      blueprint,
      validation: out.validation.explanation,
      check_status: out.status === "validated" ? "validated" : "incomplete",
      change_reason: "generation_initiale",
      mode: out.explanation.mode ?? null,
      provider: provider.name,
      model: model ?? null,
      prompt_version: PROMPT_VERSION,
    })
    .select("id")
    .single();
  // Le trigger refuse l'écriture si le rapport a été supprimé entre-temps.
  if (version.error || !version.data) throw new JobFailure("persist_version");
  await storeExercises(job, version.data.id, out.explanation, out.knowledge, new Set(out.evidence.map((e) => e.id)), controller);

  const rep = await db
    .from("reports")
    .update({ current_version_id: version.data.id, title: blueprint.title.slice(0, 300), mode: out.explanation.mode ?? null })
    .eq("id", job.report_id)
    .is("deleted_at", null);
  if (rep.error) throw new JobFailure("persist_report");
  return out.status === "validated" ? "succeeded" : "incomplete_check";
}

/**
 * Planche de dessins vectoriels (une génération) ancrés aux blocs ; un échec n'arrête jamais
 * le rapport. Désactivée pour « texte seul ».
 */
async function runDrawings(job: JobRow, explanation: ExplanationObject, blueprint: ReportBlueprint, controller: AbortController): Promise<ReportBlueprint> {
  if ((job.params.visual_mode ?? "auto") === "aucun" || process.env.LIMPID_DRAWINGS === "off") return blueprint;
  await setStage(job.id, "illustrations");
  try {
    await checkBudget(job.owner_id);
    return await generateDrawings(getProvider(), {
      explanation,
      blueprint,
      language: job.params.language ?? null,
      budget: DRAWING_BUDGET,
      signal: controller.signal,
      onUsage: (u) => recordUsage(job, "drawings", 0, u),
    });
  } catch (e) {
    if (e instanceof JobFailure) throw e; // annulation ou budget
    console.error("drawings", e instanceof ProviderError ? e.code : (e as Error).name);
    return blueprint;
  }
}

/** Recherche ou génération des illustrations prévues par le plan ; un échec n'arrête jamais le rapport. */
async function runIllustrations(job: JobRow, blueprint: ReportBlueprint, controller: AbortController): Promise<ReportBlueprint> {
  if (!job.report_id || pendingIllustrations(blueprint).length === 0) return blueprint;
  await setStage(job.id, "illustrations");
  const db = adminClient();
  const config = visualConfig();
  const reportId = job.report_id;
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY ?? "";
  const image = config.geminiImage && config.imageModel ? new GeminiProvider(geminiConfigFromEnv()) : null;
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  try {
    const out = await illustrate(blueprint, job.params.visual_mode ?? "auto", config, {
      searchCommons: (q, t) => searchCommons(q, undefined, t),
      downloadCommons: (c, t) => downloadCommons(c, undefined, t),
      searchUnsplash: config.unsplash ? (q, t) => searchUnsplash(q, unsplashKey, t) : undefined,
      trackUnsplash: (loc) => trackUnsplashDownload(loc, unsplashKey),
      generateImage: image
        ? async (prompt, aspectRatio) => {
            // Plafonds vérifiés avant chaque image ; un refus laisse le rapport sans image.
            await checkBudget(job.owner_id);
            return image.generateIllustration({ model: config.imageModel!, prompt, aspectRatio, signal: controller.signal, timeoutMs: 90_000 });
          }
        : undefined,
      onImageUsage: (attempt, u) => recordUsage(job, "illustrations", attempt, u),
      cutPlate: async (bytes, n) => (await import("@/lib/visuals/plate")).cutPlate(bytes, n),
      generatedThisMonth: async () =>
        (
          await db
            .from("visual_assets")
            .select("id", { count: "exact", head: true })
            .eq("owner_id", job.owner_id)
            .eq("provider", "gemini")
            .gte("created_at", monthStart)
        ).count ?? 0,
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
    });
    return out.blueprint;
  } catch (e) {
    if (e instanceof JobFailure) throw e; // annulation ou budget
    // Repli : sans illustration, le rapport reste complet.
    return (await illustrate(blueprint, "schemas", config, {} as never)).blueprint;
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
    onStage: (stage: "comprehension" | "explication" | "verification") => setStage(job.id, stage),
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
  // Texte réécrit : la planche de dessins est refaite pour la nouvelle version complète.
  const out = sectionId ? carried : { ...carried, blueprint: await runDrawings(job, carried.explanation, carried.blueprint, controller) };

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
