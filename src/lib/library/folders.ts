/**
 * Dossiers de la bibliothèque (V4, § 13). Écritures par le serveur après contrôle du
 * propriétaire ; supprimer un dossier ne supprime jamais ses Limpid (ils reviennent à la racine).
 */
import "server-only";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";

export const MAX_FOLDERS = 50;
export const FolderName = z.string().trim().min(1).max(80);

export class FolderError extends Error {
  constructor(readonly code: "limit" | "not_found" | "storage", message: string) {
    super(message);
  }
}

export async function createFolder(userId: string, name: string): Promise<{ id: string; name: string }> {
  const db = adminClient();
  const { count } = await db.from("folders").select("id", { count: "exact", head: true }).eq("owner_id", userId);
  if ((count ?? 0) >= MAX_FOLDERS) throw new FolderError("limit", `${MAX_FOLDERS} dossiers au maximum.`);
  const { data, error } = await db.from("folders").insert({ owner_id: userId, name }).select("id, name").single();
  if (error || !data) throw new FolderError("storage", "Le dossier n'a pas pu être créé.");
  return data;
}

export async function renameFolder(userId: string, id: string, name: string): Promise<boolean> {
  const { data } = await adminClient().from("folders").update({ name }).eq("id", id).eq("owner_id", userId).select("id");
  return !!data?.length;
}

/** Supprime le dossier seulement : ses Limpid restent (clé étrangère « on delete set null »). */
export async function deleteFolder(userId: string, id: string): Promise<boolean> {
  const { data } = await adminClient().from("folders").delete().eq("id", id).eq("owner_id", userId).select("id");
  return !!data?.length;
}

/** Déplace un Limpid vers un dossier du même compte (null : racine de la bibliothèque). */
export async function moveReport(userId: string, reportId: string, folderId: string | null): Promise<boolean> {
  const db = adminClient();
  if (folderId) {
    const { data: folder } = await db.from("folders").select("id").eq("id", folderId).eq("owner_id", userId).maybeSingle();
    if (!folder) return false;
  }
  const { data } = await db
    .from("reports")
    .update({ folder_id: folderId })
    .eq("id", reportId)
    .eq("owner_id", userId)
    .is("deleted_at", null)
    .select("id");
  return !!data?.length;
}

/** Limpid déplacés en une fois au plus. */
export const MAX_MOVE = 100;

/**
 * Déplacement groupé (une seule requête UPDATE : tout ou rien pour les Limpid du compte).
 * `expect` : pour une annulation, ne déplace que les Limpid encore dans ce dossier (une action
 * plus récente n'est jamais écrasée). Ne touche ni aux sources, ni à la lecture, ni aux versions.
 */
export async function moveReports(
  userId: string,
  reportIds: string[],
  folderId: string | null,
  expect?: string | null,
): Promise<{ moved: string[]; skipped: string[]; previous: Record<string, string | null> } | null> {
  const db = adminClient();
  if (folderId) {
    const { data: folder } = await db.from("folders").select("id").eq("id", folderId).eq("owner_id", userId).maybeSingle();
    if (!folder) return null;
  }
  const ids = [...new Set(reportIds)].slice(0, MAX_MOVE);
  const { data: before } = await db.from("reports").select("id, folder_id").in("id", ids).eq("owner_id", userId).is("deleted_at", null);
  const previous: Record<string, string | null> = {};
  for (const r of before ?? []) previous[r.id] = (r.folder_id as string | null) ?? null;
  let q = db.from("reports").update({ folder_id: folderId }).in("id", Object.keys(previous)).eq("owner_id", userId).is("deleted_at", null);
  if (expect !== undefined) q = expect === null ? q.is("folder_id", null) : q.eq("folder_id", expect);
  const { data: moved, error } = Object.keys(previous).length ? await q.select("id") : { data: [], error: null };
  if (error) throw new FolderError("storage", "Le déplacement a échoué.");
  const movedIds = (moved ?? []).map((r) => r.id as string);
  return { moved: movedIds, skipped: ids.filter((id) => !movedIds.includes(id)), previous };
}

/** Recherches récentes : la plus récente en tête, sans doublon (casse ignorée), 5 au plus. */
export function pushRecent(list: unknown, q: string): string[] {
  const prev = Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  const key = q.toLocaleLowerCase();
  return [q, ...prev.filter((x) => x.toLocaleLowerCase() !== key)].slice(0, 5);
}
