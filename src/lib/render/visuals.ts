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
  provider: "commons" | "unsplash" | "gemini";
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  sourceUrl: string | null;
  modifications: string | null;
  model: string | null;
}
