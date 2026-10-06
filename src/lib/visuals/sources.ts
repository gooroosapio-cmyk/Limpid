/**
 * Connecteurs d'images (cahier V2, § 9) : Wikimedia Commons et Unsplash. Une requête est
 * générique et expurgée (aucun extrait du document). Chaque candidat garde sa provenance et
 * ses droits ; un fichier aux droits inexploitables est écarté, jamais republié.
 */
import { createHash } from "node:crypto";
import { sniff } from "@/lib/security/file-type";
import { imageSize } from "@/lib/security/image";
import { safeFetch, type SafeFetchOptions, type SafeFetchResult } from "@/lib/security/safe-fetch";

export const USER_AGENT = "Limpid/1.0 (https://limpid.company; illustrations pedagogiques)";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Hôtes de fichiers Commons autorisés (téléchargement et redirections). */
const COMMONS_FILES = /^https:\/\/(upload|thumb)\.wikimedia\.org\//;
/** Candidats examinés par recherche (cahier : 6 au plus). */
export const MAX_CANDIDATES = 6;

export type Fetcher = (url: string, opts: SafeFetchOptions) => Promise<SafeFetchResult>;

export interface Candidate {
  provider: "commons" | "unsplash";
  /** Titre ou description publique du fichier (pour juger la pertinence). */
  title: string;
  kind: "photo" | "illustration";
  /** Fichier à télécharger (Commons) ou à afficher depuis l'hébergeur (Unsplash). */
  imageUrl: string;
  width: number;
  height: number;
  sourceUrl: string;
  author: string | null;
  license: string;
  licenseUrl: string | null;
  modifications: string | null;
  /** Unsplash : URL de suivi à appeler quand l'image est retenue (règles de l'API). */
  downloadLocation?: string;
}

export interface StoredImage {
  bytes: Buffer;
  mime: "image/jpeg" | "image/png";
  width: number;
  height: number;
  sha256: string;
}

/* ---------- Wikimedia Commons ---------- */

/** Licences réutilisables sans autorisation (la condition d'attribution est respectée par le crédit). */
const COMMONS_LICENSE = /^(cc0|pd(-[a-z0-9-]+)?|cc-by(-sa)?-[1-4](\.\d)?(-[a-z]+)?)$/i;

/** Texte brut d'un champ HTML des métadonnées (auteur souvent fourni en lien). */
export function plainText(html: string | undefined, max = 300): string | null {
  if (!html) return null;
  const t = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t ? t.slice(0, max) : null;
}

interface CommonsPage {
  index?: number;
  title?: string;
  imageinfo?: {
    mime?: string;
    thumburl?: string;
    thumbwidth?: number;
    thumbheight?: number;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string } | undefined>;
  }[];
}

export function commonsSearchUrl(query: string): string {
  const p = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: String(MAX_CANDIDATES),
    prop: "imageinfo",
    iiprop: "url|mime|size|extmetadata",
    iiurlwidth: "960",
    iiextmetadatafilter: "License|LicenseShortName|LicenseUrl|Artist|Restrictions",
  });
  return `https://commons.wikimedia.org/w/api.php?${p}`;
}

/** Candidats exploitables d'une réponse Commons, dans l'ordre de pertinence de la recherche. */
export function commonsCandidates(json: unknown): Candidate[] {
  const pages = ((json as { query?: { pages?: CommonsPage[] } })?.query?.pages ?? []).slice();
  pages.sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  const out: Candidate[] = [];
  for (const page of pages.slice(0, MAX_CANDIDATES)) {
    const info = page.imageinfo?.[0];
    const meta = info?.extmetadata ?? {};
    const license = meta.License?.value?.trim() ?? "";
    if (!info?.thumburl || !info.descriptionurl || !info.thumbwidth || !info.thumbheight) continue;
    if (info.mime !== "image/jpeg" && info.mime !== "image/png") continue;
    if (!COMMONS_LICENSE.test(license)) continue;
    // Restrictions (marque, droit à l'image, insigne…) : écarté.
    if (plainText(meta.Restrictions?.value)) continue;
    if (!COMMONS_FILES.test(info.thumburl)) continue;
    const licenseUrl = meta.LicenseUrl?.value?.trim() ?? "";
    out.push({
      provider: "commons",
      title: (page.title ?? "").replace(/^File:/, "").replace(/\.[a-z]+$/i, "").replace(/[_-]+/g, " ").slice(0, 200),
      kind: "photo",
      imageUrl: info.thumburl,
      width: info.thumbwidth,
      height: info.thumbheight,
      sourceUrl: info.descriptionurl.replace(/^http:/, "https:"),
      author: plainText(meta.Artist?.value),
      license: (plainText(meta.LicenseShortName?.value, 120) ?? license).slice(0, 120),
      licenseUrl: /^https?:\/\//.test(licenseUrl) ? licenseUrl.replace(/^http:/, "https:") : null,
      modifications: "Redimensionnée",
    });
  }
  return out;
}

export async function searchCommons(query: string, fetcher: Fetcher = safeFetch, timeoutMs = 4_000): Promise<Candidate[]> {
  const res = await fetcher(commonsSearchUrl(query), {
    maxBytes: 1_000_000,
    timeoutMs,
    maxRedirects: 0,
    allowedContentTypes: ["application/json"],
    userAgent: USER_AGENT,
  });
  return commonsCandidates(JSON.parse(res.body.toString("utf8")));
}

/* ---------- Unsplash (conditionnel) ---------- */

export function unsplashCandidates(json: unknown): Candidate[] {
  const results = (json as { results?: unknown[] })?.results ?? [];
  const out: Candidate[] = [];
  for (const r of results.slice(0, MAX_CANDIDATES) as {
    width?: number;
    height?: number;
    urls?: { regular?: string };
    links?: { html?: string; download_location?: string };
    user?: { name?: string; links?: { html?: string } };
    alt_description?: string | null;
    description?: string | null;
  }[]) {
    const url = r.urls?.regular;
    if (!url?.startsWith("https://images.unsplash.com/") || !r.links?.html || !r.width || !r.height) continue;
    // Affichage en 1080 px de large : dimensions proportionnelles.
    const width = Math.min(1080, r.width);
    out.push({
      provider: "unsplash",
      title: (r.alt_description ?? r.description ?? "").slice(0, 200),
      kind: "photo",
      imageUrl: url,
      width,
      height: Math.round((r.height * width) / r.width),
      sourceUrl: `${r.links.html}?utm_source=limpid&utm_medium=referral`,
      author: r.user?.name?.slice(0, 300) ?? null,
      license: "Licence Unsplash",
      licenseUrl: "https://unsplash.com/license",
      modifications: null,
      downloadLocation: r.links.download_location,
    });
  }
  return out;
}

export async function searchUnsplash(query: string, accessKey: string, timeoutMs = 4_000, orientation?: "landscape"): Promise<Candidate[]> {
  const params = new URLSearchParams({ query, per_page: String(MAX_CANDIDATES), content_filter: "high", ...(orientation ? { orientation } : {}) });
  const url = `https://api.unsplash.com/search/photos?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${accessKey}`, "Accept-Version": "v1" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return [];
  return unsplashCandidates(await res.json());
}

/** Suivi de téléchargement exigé par Unsplash quand une photo est retenue. */
export async function trackUnsplashDownload(location: string, accessKey: string): Promise<void> {
  if (!location.startsWith("https://api.unsplash.com/")) return;
  await fetch(location, { headers: { Authorization: `Client-ID ${accessKey}` }, signal: AbortSignal.timeout(3_000) }).catch(() => undefined);
}

/* ---------- Pertinence ---------- */

const stem = (w: string) => w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/(ies|es|s)$/, "");

/** Part des mots de la requête présents dans le titre public du fichier (0 à 1). */
export function relevance(query: string, title: string): number {
  const words = [...new Set(query.split(/\s+/).filter((w) => w.length >= 3).map(stem))];
  if (!words.length) return 0;
  const inTitle = new Set(title.split(/[^\p{L}]+/u).filter(Boolean).map(stem));
  return words.filter((w) => inTitle.has(w)).length / words.length;
}

/** Candidats jugés pertinents (au moins la moitié des mots), du plus au moins pertinent. */
export function rankCandidates(query: string, candidates: Candidate[]): Candidate[] {
  return candidates
    .map((c, i) => ({ c, i, r: relevance(query, c.title) }))
    .filter((x) => x.r >= 0.5)
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map((x) => x.c);
}

/* ---------- Téléchargement vérifié ---------- */

/** Vérifie type réel, taille et dimensions ; renvoie null si l'image ne convient pas. */
export function checkImage(bytes: Buffer): StoredImage | null {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
  const kind = sniff(bytes);
  if (kind !== "jpeg" && kind !== "png") return null;
  const size = imageSize(bytes, kind);
  if (!size || size.width < 200 || size.height < 120 || size.width > 4096 || size.height > 4096) return null;
  return {
    bytes,
    mime: kind === "png" ? "image/png" : "image/jpeg",
    width: size.width,
    height: size.height,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function downloadCommons(c: Candidate, fetcher: Fetcher = safeFetch, timeoutMs = 4_000): Promise<StoredImage | null> {
  if (c.provider !== "commons" || !COMMONS_FILES.test(c.imageUrl)) return null;
  const res = await fetcher(c.imageUrl, {
    maxBytes: MAX_IMAGE_BYTES,
    timeoutMs,
    maxRedirects: 0,
    allowedContentTypes: ["image/jpeg", "image/png"],
    userAgent: USER_AGENT,
  });
  if (!COMMONS_FILES.test(res.finalUrl)) return null;
  return checkImage(res.body);
}
