/**
 * Catalogue fermé des modèles d'image (prompt V2, politique image définitive) : Nano Banana 2.1
 * produit toutes les illustrations (schémas annotés, graphiques, frises, dessins, scènes et
 * couverture) ; GPT Image 2 est le seul secours, appelé une fois par visuel après un échec.
 * Aucun autre générateur (ni Recraft, ni Seedream, ni Flash Lite). Identifiants vérifiés dans
 * le catalogue OpenRouter le 7 octobre 2026.
 */
export type ImageStyle = "illustration" | "vector" | "realistic" | "diagram";
export const IMAGE_STYLES: readonly ImageStyle[] = ["illustration", "vector", "realistic", "diagram"];
/** Famille du modèle (tous appelés via OpenRouter). */
export type ImageProviderId = "nanobanana" | "gptimage";

export interface ImageModel {
  id: string;
  provider: ImageProviderId;
  label: string;
  /** Estimation par image 1K (USD) ; le coût réel facturé par OpenRouter est journalisé. */
  usd: number;
  output: "raster";
}

export const NANO_BANANA = "google/gemini-nano-banana-2.1";
export const GPT_IMAGE = "openai/gpt-5.4-image-2";

export const IMAGE_MODELS: readonly ImageModel[] = [
  { id: NANO_BANANA, provider: "nanobanana", label: "Nano Banana 2.1", usd: 0.04, output: "raster" },
  { id: GPT_IMAGE, provider: "gptimage", label: "GPT Image 2 (secours)", usd: 0.08, output: "raster" },
];

/** Secours unique de chaque type : GPT Image 2. */
export const FALLBACK_MODEL: Record<ImageStyle, string> = {
  illustration: GPT_IMAGE,
  vector: GPT_IMAGE,
  realistic: GPT_IMAGE,
  diagram: GPT_IMAGE,
};

/** Couverture générée quand Pixabay ne trouve rien (elle garde son fond). */
export const COVER_IMAGE_MODEL = NANO_BANANA;

/** Visuels livrés sans arrière-plan (détourage contrôlé) ; une scène garde son décor. */
export function transparentStyle(style: ImageStyle): boolean {
  return style !== "realistic";
}

export interface ImageRoute {
  provider: ImageProviderId;
  model: string;
}

export interface ImageSettings {
  enabled: boolean;
  vector: ImageRoute;
  realistic: ImageRoute;
  diagram: ImageRoute;
  illustration: ImageRoute;
}

const MAIN: ImageRoute = { provider: "nanobanana", model: NANO_BANANA };
export const DEFAULT_IMAGE_SETTINGS: ImageSettings = { enabled: true, illustration: MAIN, vector: MAIN, realistic: MAIN, diagram: MAIN };

export function modelInfo(id: string): ImageModel | null {
  return IMAGE_MODELS.find((m) => m.id === id) ?? null;
}

/** Route valide : modèle du catalogue, sinon Nano Banana (un ancien réglage Recraft ou Seedream y retombe). */
export function cleanRoute(_provider: unknown, model: unknown, style: ImageStyle): ImageRoute {
  const m = typeof model === "string" ? modelInfo(model) : null;
  return m ? { provider: m.provider, model: m.id } : DEFAULT_IMAGE_SETTINGS[style];
}

/** Réglages lus en base (colonnes d'app_settings), nettoyés. */
export function imageSettingsFrom(row: Record<string, unknown> | null | undefined): ImageSettings {
  if (!row) return DEFAULT_IMAGE_SETTINGS;
  return {
    enabled: row.images_enabled !== false,
    illustration: cleanRoute(row.image_illustration_provider, row.image_illustration_model, "illustration"),
    vector: cleanRoute(row.image_vector_provider, row.image_vector_model, "vector"),
    realistic: cleanRoute(row.image_realistic_provider, row.image_realistic_model, "realistic"),
    diagram: cleanRoute(row.image_diagram_provider, row.image_diagram_model, "diagram"),
  };
}

/** Ordre d'essai : la route réglée, puis un seul secours (GPT Image 2) s'il est différent. */
export function imageAttempts(style: ImageStyle, s: ImageSettings, available: Record<ImageProviderId, boolean>): ImageRoute[] {
  const primary = s[style];
  const fb = modelInfo(FALLBACK_MODEL[style])!;
  const routes = primary.model === fb.id ? [primary] : [primary, { provider: fb.provider, model: fb.id }];
  return routes.filter((r) => available[r.provider]);
}

/**
 * Consigne d'un schéma (Nano Banana) : composé pour l'écran d'un téléphone (portrait 3/4),
 * symétrique, aligné sur une grille, avec les seuls éléments validés (étiquettes, annotations et
 * valeurs reprises des affirmations), écrits exactement, en gros caractères.
 */
export function diagramPrompt(subject: string, purpose: string, content: string): string {
  return [
    `Clean educational diagram, portrait 3:4, designed to be read on a smartphone screen without zooming. Topic: ${subject}. Goal: ${purpose}.`,
    `Show ONLY these elements, with labels written exactly as given, in French, correct spelling and accents: ${content}.`,
    "Layout: one clear reading direction (top to bottom), elements aligned on a strict grid, symmetrical composition, equal spacing and equal box sizes, centred on the vertical axis, generous margins (at least 8% on every side), nothing cropped or touching the edges.",
    "Typography: large bold sans-serif labels (at least 4% of the image height), short lines, high contrast, no tiny text, no paragraphs.",
    "Style: flat vector look, ink green and warm yellow accents on dark ink lines, thin consistent strokes, simple arrows when order or links matter; the geometry represents the data exactly (a value twice as large is drawn twice as large).",
    "Numbers and annotations: only those listed above, copied exactly with their units; no other number, no invented data.",
    "No title, no legend, no logos, no watermark, no decorative clutter, no 3D, no perspective.",
  ].join(" ").slice(0, 1_800);
}
