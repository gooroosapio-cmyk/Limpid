/**
 * Connecteurs d'illustration disponibles (cahier V2, § 9-10). Aucune dépendance payante
 * n'est activée sans configuration explicite : Commons est gratuit, Unsplash demande une clé,
 * Gemini Image demande un modèle image déclaré et une activation.
 */
import type { VisualMode } from "@/lib/contracts/schemas";

export interface VisualConfig {
  commons: boolean;
  unsplash: boolean;
  geminiImage: boolean;
  imageModel: string | null;
  /** Images générées par compte et par mois. */
  monthlyGenerated: number;
}

export function visualConfig(env: NodeJS.ProcessEnv = process.env): VisualConfig {
  const imageModel = env.LIMPID_IMAGE_MODEL?.trim() || null;
  return {
    commons: env.LIMPID_ILLUSTRATIONS_COMMONS !== "off",
    unsplash: !!env.UNSPLASH_ACCESS_KEY?.trim() && env.LIMPID_ILLUSTRATIONS_UNSPLASH === "on",
    geminiImage: !!imageModel && env.LIMPID_ILLUSTRATIONS_GEMINI === "on",
    imageModel,
    monthlyGenerated: Math.max(0, Number(env.LIMPID_GENERATED_IMAGES_PER_MONTH ?? 20) || 0),
  };
}

/** Modes proposés au lecteur selon les connecteurs réellement disponibles. */
export function availableVisualModes(c: VisualConfig = visualConfig()): VisualMode[] {
  const web = c.commons || c.unsplash;
  return ["auto", "schemas", ...(web ? (["web"] as const) : []), ...(c.geminiImage ? (["gemini"] as const) : []), "aucun"];
}

/** Un mode indisponible retombe sur « auto » (qui n'utilise que ce qui est actif). */
export function effectiveVisualMode(mode: VisualMode, c: VisualConfig = visualConfig()): VisualMode {
  return availableVisualModes(c).includes(mode) ? mode : "auto";
}
