/**
 * Données des visuels, validées par type avant rendu (payload 2, § 6).
 * Le modèle ne produit jamais de SVG : le moteur dessine à partir de ces données.
 */
import { z } from "zod";

export const FlowData = z.strictObject({
  steps: z
    .array(z.strictObject({ label: z.string().trim().min(1).max(40), claim_id: z.string().max(80) }))
    .min(2)
    .max(8),
  cyclic: z.boolean(),
});
export type FlowData = z.infer<typeof FlowData>;

/** Barres : valeurs reprises des nombres validés des affirmations, jamais du modèle. */
export const ChartData = z.strictObject({
  unit: z.string().max(40).nullable(),
  bars: z
    .array(
      z.strictObject({
        label: z.string().trim().min(1).max(40),
        value: z.number().finite(),
        source_form: z.string().min(1).max(120),
        claim_id: z.string().max(80),
      }),
    )
    .min(2)
    .max(6),
});
export type ChartData = z.infer<typeof ChartData>;

/** Tableau comparatif : une cellule sans affirmation soutenue affiche « Non précisé ». */
export const ComparisonData = z.strictObject({
  criteria: z.array(z.string().trim().min(1).max(40)).min(2).max(6),
  options: z
    .array(
      z.strictObject({
        name: z.string().trim().min(1).max(40),
        cells: z.array(z.strictObject({ text: z.string().max(80).nullable(), claim_id: z.string().max(80).nullable() })).max(6),
      }),
    )
    .min(2)
    .max(4),
});
export type ComparisonData = z.infer<typeof ComparisonData>;

/**
 * Illustration (cahier V2, § 9) : décorative et légendée, jamais une preuve. La requête est
 * générique et expurgée ; l'actif trouvé est référencé par `asset_id` (table visual_assets).
 */
export const IllustrationData = z.strictObject({
  query: z.string().trim().min(2).max(60),
  subject: z.string().trim().min(1).max(120),
  asset_id: z.string().uuid().nullable(),
  /** Bloc dans lequel l'image est incrustée (facultatif : sinon un bloc de la partie). */
  block_id: z.string().max(80).nullable().optional(),
  /** V5 : type de visuel voulu par le plan (route d'image réglée dans la console admin). */
  style: z.enum(["illustration", "vector", "realistic", "diagram"]).optional(),
  /** Schéma (Gemini) : éléments exacts à représenter, repris de la source par le plan. */
  content: z.string().trim().max(600).optional(),
});
export type IllustrationData = z.infer<typeof IllustrationData>;

/** Requête d'image sûre : mots simples, sans chiffres ni ponctuation, 6 mots au plus. */
export function safeImageQuery(raw: string): string | null {
  const words = raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && w.length <= 24)
    .slice(0, 6);
  const q = words.join(" ");
  return q.length >= 3 ? q : null;
}

/** Écarts de taille entre barres, en proportion de la plus grande valeur absolue. */
export function barRatios(values: number[]): number[] {
  const max = Math.max(...values.map((v) => Math.abs(v)));
  return values.map((v) => (max > 0 ? Math.abs(v) / max : 0));
}

/** Actif d'illustration prêt à afficher, avec ses crédits (table distincte des preuves). */
export interface AssetView {
  id: string;
  src: string;
  width: number;
  height: number;
  provider: "commons" | "unsplash" | "gemini" | "recraft" | "seedream" | "openai";
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  sourceUrl: string | null;
  modifications: string | null;
  model: string | null;
}

/** Lien externe sûr : http(s) uniquement (jamais javascript:, data:…), sinon null. */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/* ---------- Dessins vectoriels (planche générée en une fois) ---------- */

/**
 * Petit dessin pédagogique décrit par des formes simples, sans fond. Le modèle ne fournit
 * jamais de SVG : le moteur dessine lui-même ces formes (aucun script, aucun lien, aucun
 * style injecté), avec les couleurs du thème.
 */
export const DRAW_TONES = ["ink", "accent", "green", "muted", "soft"] as const;
export const DRAW_RATIOS = { "1:1": [100, 100], "4:3": [100, 75], "3:4": [75, 100] } as const;
/** Chemin restreint : commandes M, L, H, V, Q, C, S, T, A, Z et nombres uniquement. */
export const PATH_RE = /^(?:[MLHVQCSTAZmlhvqcstaz]|[\s,]|-?\d{1,3}(?:\.\d{1,2})?)+$/;
const coord = z.number().finite().min(-5).max(105);
const size = z.number().finite().min(0).max(105);

export const DrawShape = z.strictObject({
  t: z.enum(["circle", "ellipse", "rect", "line", "arrow", "path", "text"]),
  /** Centre (cercle, ellipse, texte), coin haut gauche (rectangle), départ (trait, flèche). */
  x: coord,
  y: coord,
  w: size.nullable(),
  h: size.nullable(),
  r: z.number().finite().min(0).max(60).nullable(),
  x2: coord.nullable(),
  y2: coord.nullable(),
  d: z.string().max(400).regex(PATH_RE).nullable(),
  text: z.string().trim().max(24).nullable(),
  tone: z.enum(DRAW_TONES),
  fill: z.boolean(),
});
export type DrawShape = z.infer<typeof DrawShape>;

export const DrawingData = z.strictObject({
  block_id: z.string().max(80),
  ratio: z.enum(["1:1", "4:3", "3:4"]),
  shapes: z.array(DrawShape).min(2).max(30),
});
export type DrawingData = z.infer<typeof DrawingData>;

/** Pointe de flèche (triangle) au bout d'un trait, en coordonnées du dessin. */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, len = 5): string {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const p = (ang: number) => `${(x2 - len * Math.cos(ang)).toFixed(1)},${(y2 - len * Math.sin(ang)).toFixed(1)}`;
  return `${x2.toFixed(1)},${y2.toFixed(1)} ${p(a - 0.45)} ${p(a + 0.45)}`;
}
