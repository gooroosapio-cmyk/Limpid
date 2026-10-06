/**
 * Catalogue fermé des modèles d'image et réglages de la console admin : un modèle par type de
 * visuel, tous servis par l'API Images d'OpenRouter (une seule clé). Choix du comparatif IA du
 * 6 octobre 2026 : Recraft V4.1 Flash pour les illustrations simples, Recraft V4.1 Vector pour
 * les SVG (banque Limpid d'abord), Seedream 5.0 Flash pour les scènes, les schémas (annotés,
 * valeurs reprises des affirmations) et la couverture de secours. Repli sur un autre modèle.
 */
export type ImageStyle = "illustration" | "vector" | "realistic" | "diagram";
export const IMAGE_STYLES: readonly ImageStyle[] = ["illustration", "vector", "realistic", "diagram"];
/** Famille du modèle (tous appelés via OpenRouter). */
export type ImageProviderId = "recraft" | "seedream" | "nanobanana";

export interface ImageModel {
  id: string;
  provider: ImageProviderId;
  label: string;
  /** Prix public par image sur OpenRouter (USD, 6 octobre 2026). */
  usd: number;
  output: "svg" | "raster";
}

export const IMAGE_MODELS: readonly ImageModel[] = [
  { id: "recraft/recraft-v4.1-flash", provider: "recraft", label: "Recraft V4.1 Flash (image)", usd: 0.007, output: "raster" },
  { id: "recraft/recraft-v4.1", provider: "recraft", label: "Recraft V4.1 (image)", usd: 0.035, output: "raster" },
  { id: "recraft/recraft-v4.1-vector", provider: "recraft", label: "Recraft V4.1 Vector (SVG)", usd: 0.08, output: "svg" },
  { id: "bytedance-seed/seedream-5-0-flash", provider: "seedream", label: "Seedream 5.0 Flash", usd: 0.018, output: "raster" },
  { id: "google/gemini-3.1-flash-lite-image", provider: "nanobanana", label: "Nano Banana 2 Lite", usd: 0.034, output: "raster" },
  { id: "google/gemini-3.1-flash-image", provider: "nanobanana", label: "Nano Banana 2", usd: 0.067, output: "raster" },
];

/** Repli d'un type quand son modèle échoue (autre famille, même sortie). */
export const FALLBACK_MODEL: Record<ImageStyle, string> = {
  illustration: "bytedance-seed/seedream-5-0-flash",
  vector: "recraft/recraft-v4.1-flash",
  realistic: "recraft/recraft-v4.1",
  diagram: "recraft/recraft-v4.1",
};

/** Couverture générée quand Pixabay ne trouve rien. */
export const COVER_IMAGE_MODEL = "bytedance-seed/seedream-5-0-flash";

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

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  enabled: true,
  illustration: { provider: "recraft", model: "recraft/recraft-v4.1-flash" },
  vector: { provider: "recraft", model: "recraft/recraft-v4.1-vector" },
  realistic: { provider: "seedream", model: "bytedance-seed/seedream-5-0-flash" },
  diagram: { provider: "seedream", model: "bytedance-seed/seedream-5-0-flash" },
};

export function modelInfo(id: string): ImageModel | null {
  return IMAGE_MODELS.find((m) => m.id === id) ?? null;
}

/**
 * Route valide : modèle connu du catalogue, sinon le défaut du type (un ancien identifiant
 * de l'API Recraft directe retombe ainsi sur son équivalent OpenRouter). Un SVG reste un SVG.
 */
export function cleanRoute(_provider: unknown, model: unknown, style: ImageStyle): ImageRoute {
  const m = typeof model === "string" ? modelInfo(model) : null;
  if (m && (style === "vector") === (m.output === "svg")) return { provider: m.provider, model: m.id };
  return DEFAULT_IMAGE_SETTINGS[style];
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

/** Ordre d'essai : la route réglée, puis le modèle de repli du type (s'il est différent). */
export function imageAttempts(style: ImageStyle, s: ImageSettings, available: Record<ImageProviderId, boolean>): ImageRoute[] {
  const primary = s[style];
  const fb = modelInfo(FALLBACK_MODEL[style])!;
  const routes = primary.model === fb.id ? [primary] : [primary, { provider: fb.provider, model: fb.id }];
  return routes.filter((r) => available[r.provider]);
}

/**
 * Consigne d'un schéma (Seedream) : composé pour l'écran d'un téléphone (portrait 3/4),
 * symétrique, aligné sur une grille, avec les seuls éléments validés (étiquettes, annotations et
 * valeurs reprises des affirmations), écrits exactement, en gros caractères.
 */
export function diagramPrompt(subject: string, purpose: string, content: string): string {
  return [
    `Clean educational diagram, portrait 3:4, designed to be read on a smartphone screen without zooming. Topic: ${subject}. Goal: ${purpose}.`,
    `Show ONLY these elements, with labels written exactly as given, in French, correct spelling and accents: ${content}.`,
    "Layout: one clear reading direction (top to bottom), elements aligned on a strict grid, symmetrical composition, equal spacing and equal box sizes, centred on the vertical axis, generous margins (at least 8% on every side), nothing cropped or touching the edges.",
    "Typography: large bold sans-serif labels (at least 4% of the image height), short lines, high contrast, no tiny text, no paragraphs.",
    "Style: flat vector look, plain ivory background, ink green and warm yellow accents, thin consistent strokes, simple arrows when order or links matter.",
    "Numbers and annotations: only those listed above, copied exactly with their units; no other number, no invented data.",
    "No title, no legend, no logos, no watermark, no decorative clutter, no 3D, no perspective.",
  ].join(" ").slice(0, 1_800);
}
