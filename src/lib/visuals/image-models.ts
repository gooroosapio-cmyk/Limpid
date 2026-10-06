/**
 * Catalogue fermé des modèles d'image (V5) et réglages de la console admin : un fournisseur et
 * un modèle par type de visuel. Recraft en priorité pour les illustrations vectorielles, Nano
 * Banana (Gemini Image via OpenRouter) pour les scènes réalistes ; repli sur l'autre fournisseur.
 */
export type ImageStyle = "vector" | "realistic";
export type ImageProviderId = "recraft" | "nanobanana";

export interface ImageModel {
  id: string;
  provider: ImageProviderId;
  label: string;
  /** Prix public par image (USD, 6 octobre 2026). */
  usd: number;
  output: "svg" | "raster";
}

export const IMAGE_MODELS: readonly ImageModel[] = [
  { id: "recraftv4_1_vector", provider: "recraft", label: "Recraft V4.1 Vector", usd: 0.08, output: "svg" },
  { id: "recraftv4_1_utility_vector", provider: "recraft", label: "Recraft V4.1 Utility Vector", usd: 0.08, output: "svg" },
  { id: "recraftv4_1_pro_vector", provider: "recraft", label: "Recraft V4.1 Pro Vector", usd: 0.3, output: "svg" },
  { id: "recraftv4_1_flash", provider: "recraft", label: "Recraft V4.1 Flash (image)", usd: 0.007, output: "raster" },
  { id: "recraftv4_1", provider: "recraft", label: "Recraft V4.1 (image)", usd: 0.035, output: "raster" },
  { id: "recraftv4_1_pro", provider: "recraft", label: "Recraft V4.1 Pro (image 2K)", usd: 0.21, output: "raster" },
  { id: "google/gemini-3.1-flash-lite-image", provider: "nanobanana", label: "Nano Banana 2 Lite", usd: 0.034, output: "raster" },
  { id: "google/gemini-3.1-flash-image", provider: "nanobanana", label: "Nano Banana 2", usd: 0.067, output: "raster" },
];

export const DEFAULT_MODEL: Record<ImageProviderId, Record<ImageStyle, string>> = {
  recraft: { vector: "recraftv4_1_vector", realistic: "recraftv4_1" },
  nanobanana: { vector: "google/gemini-3.1-flash-lite-image", realistic: "google/gemini-3.1-flash-lite-image" },
};

/** Couverture de repli (cadrage V5) : Nano Banana 2 Lite. */
export const COVER_MODEL = "google/gemini-3.1-flash-lite-image";

export interface ImageRoute {
  provider: ImageProviderId;
  model: string;
}

export interface ImageSettings {
  enabled: boolean;
  vector: ImageRoute;
  realistic: ImageRoute;
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  enabled: true,
  vector: { provider: "recraft", model: "recraftv4_1_vector" },
  realistic: { provider: "nanobanana", model: "google/gemini-3.1-flash-lite-image" },
};

export function modelInfo(id: string): ImageModel | null {
  return IMAGE_MODELS.find((m) => m.id === id) ?? null;
}

/** Route valide : modèle connu et cohérent avec son fournisseur, sinon le défaut du type. */
export function cleanRoute(provider: unknown, model: unknown, style: ImageStyle): ImageRoute {
  const m = typeof model === "string" ? modelInfo(model) : null;
  if (m && m.provider === provider) return { provider: m.provider, model: m.id };
  return DEFAULT_IMAGE_SETTINGS[style];
}

/** Réglages lus en base (colonnes d'app_settings), nettoyés. */
export function imageSettingsFrom(row: Record<string, unknown> | null | undefined): ImageSettings {
  if (!row) return DEFAULT_IMAGE_SETTINGS;
  return {
    enabled: row.images_enabled !== false,
    vector: cleanRoute(row.image_vector_provider, row.image_vector_model, "vector"),
    realistic: cleanRoute(row.image_realistic_provider, row.image_realistic_model, "realistic"),
  };
}

/** Ordre d'essai d'une illustration : la route réglée, puis l'autre fournisseur (si disponible). */
export function imageAttempts(style: ImageStyle, s: ImageSettings, available: Record<ImageProviderId, boolean>): ImageRoute[] {
  const primary = s[style];
  const other: ImageProviderId = primary.provider === "recraft" ? "nanobanana" : "recraft";
  const routes = [primary, { provider: other, model: DEFAULT_MODEL[other][style] }];
  return routes.filter((r) => available[r.provider]);
}
