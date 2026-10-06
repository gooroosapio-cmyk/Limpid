/**
 * Fichiers importés (cadrage Q18 : original purgé sous 24 h). Le navigateur envoie le
 * fichier directement dans le bucket privé `sources` par une URL signée à usage unique
 * (les fonctions Vercel refusent les corps de plus de 4,5 Mo) ; le serveur le relit,
 * l'analyse, puis l'efface aussitôt. Les envois abandonnés sont purgés par le cron.
 */
import "server-only";
import { z } from "zod";
import { limits, retention } from "@/lib/config";
import { adminClient } from "@/lib/supabase/admin";

export const BUCKET = "sources";

/** Extensions acceptées et type de source correspondant (images et PDF scannés : lecture OCR). */
export const UPLOAD_KINDS = {
  pdf: "pdf",
  docx: "docx",
  txt: "txt",
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
} as const;
export type UploadKind = (typeof UPLOAD_KINDS)[keyof typeof UPLOAD_KINDS];

/** Délai laissé au navigateur pour envoyer le fichier avant purge (l'URL signée vit 2 h). */
const PENDING_UPLOAD_HOURS = 3;
const MAX_PENDING_PER_HOUR = 30;

export const UploadRequest = z.strictObject({
  file_name: z.string().trim().min(1).max(200),
  byte_size: z.number().int().min(1),
});

export class UploadError extends Error {
  constructor(
    public readonly code: "type" | "too_large" | "rate" | "storage",
    message: string,
  ) {
    super(message);
  }
}

export function kindFromFileName(name: string): UploadKind | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return ext in UPLOAD_KINDS ? UPLOAD_KINDS[ext as keyof typeof UPLOAD_KINDS] : null;
}

/** Titre lisible : nom du fichier sans extension ni caractères de contrôle. */
export function titleFromFileName(name: string): string {
  const base = name.replace(/[\u0000-\u001F\u007F]/g, "").replace(/\.[A-Za-z0-9]{1,5}$/, "").trim();
  return (base || "Document").slice(0, 200);
}

export async function createUpload(
  userId: string,
  input: z.infer<typeof UploadRequest>,
): Promise<{ uploadId: string; signedUrl: string }> {
  const kind = kindFromFileName(input.file_name);
  if (!kind) throw new UploadError("type", "Formats acceptés : PDF, DOCX, TXT, JPG, PNG et WEBP.");
  if (input.byte_size > limits.maxFileBytes) {
    throw new UploadError("too_large", `Le fichier dépasse ${Math.round(limits.maxFileBytes / 1024 / 1024)} Mo.`);
  }

  const db = adminClient();
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db
    .from("sources")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .eq("status", "uploaded")
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_PENDING_PER_HOUR) {
    throw new UploadError("rate", "Trop d'envois en attente. Réessayez dans une heure.");
  }

  const uploadId = crypto.randomUUID();
  const path = `${userId}/${uploadId}`;
  const row = await db.from("sources").insert({
    id: uploadId,
    owner_id: userId,
    kind,
    title: input.file_name.slice(0, 300),
    storage_path: path,
    byte_size: input.byte_size,
    status: "uploaded",
    original_purge_at: new Date(Date.now() + PENDING_UPLOAD_HOURS * 3600_000).toISOString(),
  });
  if (row.error) throw new UploadError("storage", "Préparation de l'envoi impossible.");

  const signed = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (signed.error || !signed.data) {
    await db.from("sources").delete().eq("id", uploadId);
    throw new UploadError("storage", "Préparation de l'envoi impossible.");
  }
  return { uploadId, signedUrl: signed.data.signedUrl };
}

/** Efface l'original d'une source et le note (idempotent). */
/** Échéance de l'original d'une source lue : aucune (null) depuis la V4, sauf réglage contraire. */
export function purgeDate(): string | null {
  return retention.originalHours > 0 ? new Date(Date.now() + retention.originalHours * 3600_000).toISOString() : null;
}

export async function purgeOriginal(sourceId: string, path: string | null): Promise<boolean> {
  const db = adminClient();
  const removed = !path || !(await db.storage.from(BUCKET).remove([path])).error;
  if (removed) {
    await db
      .from("sources")
      .update({ storage_path: null, original_purged_at: new Date().toISOString() })
      .eq("id", sourceId);
  }
  return removed;
}

/**
 * Purge planifiée : originaux arrivés à échéance, et envois jamais utilisés (lignes
 * supprimées avec leur fichier). Renvoie le nombre de sources traitées.
 */
export async function purgeDueOriginals(limit = 200): Promise<number> {
  const db = adminClient();
  const now = new Date().toISOString();
  const { data } = await db
    .from("sources")
    .select("id, status, storage_path")
    .lt("original_purge_at", now)
    .is("original_purged_at", null)
    .limit(limit);
  let n = 0;
  for (const s of data ?? []) {
    const ok = await purgeOriginal(s.id, s.storage_path);
    if (ok && (s.status === "uploaded" || s.status === "extracting")) {
      await db.from("sources").delete().eq("id", s.id).in("status", ["uploaded", "extracting"]);
    }
    if (ok) n++;
  }
  return n;
}

/**
 * Sources préparées puis jamais utilisées (aucun rapport après 24 h) : leur texte extrait
 * est une donnée du document, il n'est pas gardé (cadrage Q18, cahier V2 § 19).
 */
export async function purgeUnusedSources(limit = 100): Promise<number> {
  const db = adminClient();
  const before = new Date(Date.now() - retention.unusedHours * 3600_000).toISOString();
  const { data } = await db
    .from("sources")
    .select("id, storage_path, reports!report_sources(id)")
    .in("status", ["extracted", "partial", "extracting"])
    .lt("created_at", before)
    .limit(limit);
  let n = 0;
  for (const s of data ?? []) {
    if ((s.reports as unknown as unknown[] | null)?.length) continue;
    if (s.storage_path && !(await purgeOriginal(s.id, s.storage_path))) continue;
    if (!(await db.from("sources").delete().eq("id", s.id)).error) n++;
  }
  return n;
}
