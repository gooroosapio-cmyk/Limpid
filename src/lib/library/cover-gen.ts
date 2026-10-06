/**
 * Couverture de chaque cours : une illustration de la banque Pixabay choisie d'après le thème
 * du document (mots-clés prévus par le plan, sinon le titre). Aucune image générée par l'IA.
 * Pixabay interdit l'affichage permanent depuis ses serveurs : l'image est téléchargée,
 * recadrée en 4/3 (WebP 1200 × 900) et servie par Limpid, avec le crédit de l'auteur. Sans
 * résultat, le dégradé de la banque reste : le cours est complet.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";

const API = "https://pixabay.com/api/";
const IMAGE_HOSTS = new Set(["pixabay.com", "cdn.pixabay.com"]);
const MAX_BYTES = 8 * 1024 * 1024;

export function pixabayKey(env: Record<string, string | undefined> = process.env): string | null {
  return env.PIXABAY_API_KEY?.trim() || null;
}

export function coverGenerationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return !!pixabayKey(env);
}

export interface PixabayHit {
  imageUrl: string;
  pageUrl: string;
  author: string | null;
  width: number;
  height: number;
}

/** Résultats exploitables : image téléchargeable sur un hôte Pixabay, assez large, page publique. */
export function pixabayHits(json: unknown): PixabayHit[] {
  const hits = (json as { hits?: unknown[] })?.hits ?? [];
  const out: PixabayHit[] = [];
  for (const h of hits as { largeImageURL?: string; webformatURL?: string; pageURL?: string; user?: string; imageWidth?: number; imageHeight?: number }[]) {
    const url = h.largeImageURL || h.webformatURL;
    if (!url || !h.pageURL?.startsWith("https://pixabay.com/")) continue;
    let host = "";
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") continue;
      host = u.hostname;
    } catch {
      continue;
    }
    if (!IMAGE_HOSTS.has(host) || (h.imageWidth ?? 0) < 800) continue;
    out.push({ imageUrl: url, pageUrl: h.pageURL, author: h.user?.slice(0, 120) ?? null, width: h.imageWidth ?? 0, height: h.imageHeight ?? 0 });
  }
  return out;
}

/** Requête : mots-clés du plan (anglais), sinon le titre (français) ; ponctuation retirée. */
export function coverQuery(keywords: string, title: string): { q: string; lang: "en" | "fr" } | null {
  const clean = (t: string) => t.replace(/[^\p{L}\p{N} -]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 90);
  const k = clean(keywords);
  if (k.length >= 3) return { q: k, lang: "en" };
  const words = clean(title).split(" ").filter((w) => w.length > 3).slice(0, 5).join(" ");
  return words.length >= 3 ? { q: words, lang: "fr" } : null;
}

async function search(key: string, q: string, lang: string, type: "illustration" | "all"): Promise<PixabayHit[]> {
  const params = new URLSearchParams({ key, q, lang, image_type: type, orientation: "horizontal", safesearch: "true", order: "popular", per_page: "20" });
  const res = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(6_000) }).catch(() => null);
  if (!res?.ok) return [];
  return pixabayHits(await res.json().catch(() => null));
}

/**
 * Cherche une illustration, la télécharge et la rattache au cours. `pick` : rang du résultat
 * (0 = le plus pertinent ; « Changer de couverture » en prend un autre). Renvoie le chemin.
 */
export async function pixabayCover(input: { reportId: string; ownerId: string; keywords: string; title: string; pick?: number }): Promise<string | null> {
  const key = pixabayKey();
  const query = coverQuery(input.keywords, input.title);
  if (!key || !query) return null;
  let hits = await search(key, query.q, query.lang, "illustration");
  if (hits.length === 0) hits = await search(key, query.q, query.lang, "all");
  const hit = hits[Math.min(input.pick ?? 0, Math.max(0, hits.length - 1))];
  if (!hit) return null;
  const file = await fetch(hit.imageUrl, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const length = Number(file?.headers.get("content-length") ?? 0);
  if (!file?.ok || length > MAX_BYTES || !(file.headers.get("content-type") ?? "").startsWith("image/")) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_BYTES) return null;
  const sharp = (await import("sharp")).default;
  let webp: Buffer;
  try {
    webp = await sharp(bytes, { limitInputPixels: 40_000_000 }).resize(1200, 900, { fit: "cover", position: "attention" }).webp({ quality: 78 }).toBuffer();
  } catch {
    return null;
  }
  const db = adminClient();
  const path = `covers/${input.reportId}/${randomUUID()}.webp`;
  const { error } = await db.storage.from("exports").upload(path, webp, { contentType: "image/webp", upsert: false });
  if (error) return null;
  const { data: prev } = await db.from("reports").select("cover_path").eq("id", input.reportId).maybeSingle();
  const credit = { author: hit.author, url: hit.pageUrl, source: "pixabay" };
  const { error: upd } = await db
    .from("reports")
    .update({ cover_path: path, cover_url: null, cover_credit: credit, cover_id: null })
    .eq("id", input.reportId)
    .eq("owner_id", input.ownerId);
  if (upd) {
    await db.storage.from("exports").remove([path]);
    return null;
  }
  if (prev?.cover_path) await db.storage.from("exports").remove([prev.cover_path as string]);
  return path;
}

/** Couverture d'un nouveau cours (après livraison) : illustration Pixabay, sinon rien. */
export async function chooseCover(input: { reportId: string; ownerId: string; title: string; query: string }): Promise<void> {
  await pixabayCover({ reportId: input.reportId, ownerId: input.ownerId, keywords: input.query, title: input.title });
}
