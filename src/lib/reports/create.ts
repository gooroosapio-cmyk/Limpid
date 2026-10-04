/**
 * Création d'un rapport : la source (texte collé, fichier envoyé ou page web) est
 * extraite en segments figés, puis le rapport et sa tâche de génération sont écrits
 * côté serveur pour l'utilisateur authentifié. Idempotent par clé client.
 */
import "server-only";
import { z } from "zod";
import { isUrlImportEnabled, limits } from "@/lib/config";
import { Goal, Level, TargetPages } from "@/lib/contracts/schemas";
import { extractSource, ExtractionError, type ExtractableKind, type SourceCoverage } from "@/lib/extract";
import { segmentText, type ExtractedText } from "@/lib/extract/text";
import { checkUpload, FileRejected } from "@/lib/security/file-type";
import { checkImageSize, type ImageKind } from "@/lib/security/image";
import { parsePublicUrl, safeFetch, UrlRejected } from "@/lib/security/safe-fetch";
import { BUCKET, purgeOriginal, titleFromFileName } from "@/lib/sources/uploads";
import { adminClient } from "@/lib/supabase/admin";

const Params = {
  level: Level,
  goal: Goal,
  target_pages: TargetPages,
  idempotency_key: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
};

export const CreateRequest = z.preprocess(
  // Compatibilité : l'ancien formulaire envoyait le texte sans préciser la source.
  (v) => (v && typeof v === "object" && !("source" in v) && "text" in v ? { ...v, source: "text" } : v),
  z.discriminatedUnion("source", [
    z.strictObject({
      source: z.literal("text"),
      title: z.string().trim().max(200).optional(),
      text: z.string().min(1).max(limits.maxPastedChars),
      ...Params,
    }),
    z.strictObject({
      source: z.literal("upload"),
      upload_id: z.string().uuid(),
      /** Accord explicite pour envoyer l'image ou le PDF scanné à Gemini (cadrage Q15). */
      allow_ocr: z.boolean().optional(),
      ...Params,
    }),
    z.strictObject({ source: z.literal("url"), url: z.string().trim().min(1).max(2048), ...Params }),
  ]),
);
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
      | "ocr_consent",
    message: string,
    /** Pages à lire par OCR (demande d'accord). */
    public readonly pages?: number,
  ) {
    super(message);
  }
}

function defaultTitle(text: string): string {
  const first = text.trim().split("\n").find((l) => l.trim())?.trim() ?? "Texte collé";
  return first.length > 80 ? `${first.slice(0, 77).trimEnd()}…` : first;
}

interface PreparedSource {
  sourceId: string;
  /** Absent quand le texte sera lu par OCR dans la tâche (fichier conservé jusque-là). */
  extracted: ExtractedText | null;
  /** Source déjà enregistrée (fichier envoyé) : mise à jour plutôt qu'insertion. */
  existing: boolean;
  row: {
    kind: "paste" | "url" | "pdf" | "docx" | "txt" | ImageKind;
    title: string;
    byte_size: number;
    original_url?: string;
    page_count?: number | null;
    coverage: SourceCoverage | Record<string, unknown>;
  };
}

function extractionMessage(e: unknown): string {
  if (e instanceof ExtractionError || e instanceof FileRejected || e instanceof UrlRejected) return e.message;
  return "Le document n'a pas pu être lu.";
}

async function fromText(input: Extract<CreateRequest, { source: "text" }>): Promise<PreparedSource> {
  const sourceId = crypto.randomUUID();
  let extracted: ExtractedText;
  try {
    extracted = segmentText(input.text, `src_${sourceId}`, { maxChars: limits.maxPastedChars });
  } catch (e) {
    throw new CreateError("extraction", extractionMessage(e));
  }
  return {
    sourceId,
    extracted,
    existing: false,
    row: {
      kind: "paste",
      title: (input.title || defaultTitle(input.text)).slice(0, 200),
      byte_size: Buffer.byteLength(input.text, "utf8"),
      coverage: { segments_total: extracted.segments.length, segments_processed: extracted.segments.length, partial: false },
    },
  };
}

async function fromUpload(userId: string, uploadId: string, allowOcr: boolean): Promise<PreparedSource> {
  const db = adminClient();
  // Réservation : un même envoi ne peut servir qu'une fois.
  const { data: src } = await db
    .from("sources")
    .update({ status: "extracting" })
    .eq("id", uploadId)
    .eq("owner_id", userId)
    .eq("status", "uploaded")
    .is("deleted_at", null)
    .select("id, kind, title, storage_path")
    .maybeSingle();
  if (!src?.storage_path) throw new CreateError("upload_missing", "Ce fichier n'est plus disponible. Envoyez-le à nouveau.");

  // Fichier refusé ou illisible : rien n'est conservé (ni l'original, ni la ligne).
  const fail = async (code: string, message: string): Promise<never> => {
    console.error("upload rejected", code);
    if (await purgeOriginal(src.id, src.storage_path)) await db.from("sources").delete().eq("id", src.id);
    throw new CreateError("extraction", message);
  };
  // Lecture OCR non encore acceptée : l'envoi reste disponible pour une nouvelle demande.
  const askConsent = async (message: string, pages: number): Promise<never> => {
    await db.from("sources").update({ status: "uploaded" }).eq("id", src.id);
    throw new CreateError("ocr_consent", message, pages);
  };

  const download = await db.storage.from(BUCKET).download(src.storage_path);
  if (download.error || !download.data) {
    return fail("missing", "Le fichier n'est pas arrivé jusqu'au serveur. Envoyez-le à nouveau.");
  }
  const buf = new Uint8Array(await download.data.arrayBuffer());

  let kind: "pdf" | "docx" | "txt" | ImageKind;
  try {
    // Signature réelle contre extension déclarée ; le type MIME du navigateur n'est pas fiable.
    const detected = checkUpload(buf, src.title, "", limits.maxFileBytes);
    if (detected !== src.kind) throw new FileRejected("type_mismatch", "Le contenu du fichier ne correspond pas à son extension.");
    if (detected === "png" || detected === "jpeg" || detected === "webp") checkImageSize(buf, detected, limits.maxImageMegapixels);
    kind = detected;
  } catch (e) {
    return fail(e instanceof FileRejected ? e.code : "type", extractionMessage(e));
  }

  // Lecture OCR : image, ou PDF sans couche texte. Le texte sera lu dans la tâche.
  const ocr = async (pages: number): Promise<PreparedSource> => {
    if (buf.length > limits.maxOcrBytes) {
      return fail("ocr_too_large", `Pour être lu comme une image, le fichier doit faire moins de ${Math.round(limits.maxOcrBytes / 1024 / 1024)} Mo.`);
    }
    const what = kind === "pdf" ? `Ce PDF est scanné (${pages} page${pages > 1 ? "s" : ""}).` : "Cette image doit être lue.";
    if (!allowOcr) return askConsent(`${what} Pour en lire le texte, le fichier sera envoyé à Google Gemini.`, pages);
    return {
      sourceId: src.id,
      extracted: null,
      existing: true,
      row: {
        kind,
        title: titleFromFileName(src.title),
        byte_size: buf.length,
        page_count: kind === "pdf" ? pages : null,
        coverage: { pending_ocr: true },
      },
    };
  };
  if (kind !== "pdf" && kind !== "docx" && kind !== "txt") return ocr(1);

  let result;
  try {
    result = await extractSource(kind, buf, `src_${src.id}`, { maxChars: limits.maxSourceChars, maxPages: limits.maxPages });
  } catch (e) {
    if (e instanceof ExtractionError && e.code === "scanned" && kind === "pdf" && e.pageCount) return ocr(e.pageCount);
    return fail(e instanceof ExtractionError ? e.code : "extraction", extractionMessage(e));
  }
  // Le texte est figé en base : l'original n'est plus nécessaire (cadrage Q18).
  await purgeOriginal(src.id, src.storage_path);

  return {
    sourceId: src.id,
    extracted: result.extracted,
    existing: true,
    row: {
      kind,
      title: titleFromFileName(src.title),
      byte_size: buf.length,
      page_count: result.pageCount,
      coverage: result.coverage,
    },
  };
}

const URL_TYPES: Record<string, ExtractableKind> = {
  "text/html": "html",
  "application/xhtml+xml": "html",
  "text/plain": "txt",
  "application/pdf": "pdf",
};

async function fromUrl(rawUrl: string): Promise<PreparedSource> {
  if (!isUrlImportEnabled()) throw new CreateError("url_disabled", "L'import par lien est désactivé sur ce serveur.");
  let page;
  try {
    parsePublicUrl(rawUrl);
    page = await safeFetch(rawUrl, {
      maxBytes: limits.maxFileBytes,
      timeoutMs: limits.urlTimeoutMs,
      maxRedirects: limits.urlMaxRedirects,
      allowedContentTypes: Object.keys(URL_TYPES),
    });
  } catch (e) {
    throw new CreateError("url", e instanceof UrlRejected ? e.message : "La page n'a pas pu être téléchargée.");
  }

  const sourceId = crypto.randomUUID();
  const kind = URL_TYPES[page.contentType]!;
  let result;
  try {
    result = await extractSource(kind, page.body, `src_${sourceId}`, {
      maxChars: limits.maxSourceChars,
      maxPages: limits.maxPages,
      charset: page.charset,
    });
  } catch (e) {
    if (e instanceof ExtractionError && e.code === "scanned") {
      throw new CreateError("extraction", `${e.message} Téléchargez-le puis envoyez-le dans l'onglet Fichier pour qu'il soit lu.`);
    }
    throw new CreateError("extraction", extractionMessage(e));
  }
  const final = new URL(page.finalUrl);
  const fallbackTitle = `${final.hostname}${final.pathname === "/" ? "" : final.pathname}`;
  return {
    sourceId,
    extracted: result.extracted,
    existing: false,
    row: {
      kind: "url",
      title: (result.title || fallbackTitle).slice(0, 200),
      byte_size: page.body.length,
      original_url: page.finalUrl.slice(0, 2048),
      page_count: result.pageCount,
      coverage: result.coverage,
    },
  };
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

  const prepared =
    input.source === "text"
      ? await fromText(input)
      : input.source === "upload"
        ? await fromUpload(userId, input.upload_id, input.allow_ocr === true)
        : await fromUrl(input.url);
  const { sourceId, extracted, row } = prepared;
  const partial = "partial" in row.coverage && row.coverage.partial === true;

  // Lecture OCR à venir : l'original reste au plus 24 h (cadrage Q18), la tâche le lira avant.
  const fields = extracted
    ? { ...row, content_hash: extracted.sourceVersion, status: partial ? "partial" : "extracted" }
    : { ...row, status: "extracting", original_purge_at: new Date(Date.now() + 24 * 3600_000).toISOString() };
  const src = prepared.existing
    ? await db.from("sources").update(fields).eq("id", sourceId)
    : await db.from("sources").insert({ id: sourceId, owner_id: userId, ...fields });
  if (src.error) throw new CreateError("storage", "Enregistrement de la source impossible.");

  const removeSource = async () => {
    // Fichier conservé pour l'OCR : effacé avec la source (chemin fixé à l'envoi).
    if (!extracted) await purgeOriginal(sourceId, `${userId}/${sourceId}`);
    await db.from("sources").delete().eq("id", sourceId);
  };
  const segs = !extracted ? { error: null } : await db.from("source_segments").insert(
    extracted.segments.map((s, i) => ({
      id: s.id,
      source_id: sourceId,
      owner_id: userId,
      source_version: s.source_version,
      ordinal: i,
      locator: s.locator,
      text: s.text,
      content_hash: s.content_hash,
      extraction_warnings: s.extraction_warnings,
    })),
  );
  if (segs.error) {
    await removeSource();
    throw new CreateError("storage", "Enregistrement du texte impossible.");
  }

  const report = await db
    .from("reports")
    .insert({ owner_id: userId, source_id: sourceId, title: row.title })
    .select("id")
    .single();
  if (report.error || !report.data) {
    await removeSource();
    throw new CreateError("storage", "Création du rapport impossible.");
  }

  const job = await db.from("jobs").insert({
    owner_id: userId,
    report_id: report.data.id,
    source_id: sourceId,
    kind: "generate_report",
    idempotency_key: input.idempotency_key,
    params: { level: input.level, goal: input.goal, target_pages: input.target_pages, ...(extracted ? {} : { ocr: true }) },
  });
  if (job.error) {
    await removeSource();
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
  return { reportId: report.data.id };
}
