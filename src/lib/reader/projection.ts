/**
 * Lecteur V3 : projections locales d'un même contenu (aucun appel IA, mêmes blocs, mêmes
 * ancres). Auto choisit une projection dominante à partir des métadonnées déjà produites ;
 * ces seuils sont des heuristiques de produit, à calibrer en production.
 */
export const PROJECTIONS = ["book", "guided", "visual"] as const;
export type Projection = (typeof PROJECTIONS)[number];
export type ProjectionChoice = "auto" | Projection;
export type ProjectionReason = "mode" | "steps" | "visuals" | "default";

/** Comptes par cours, calculés à la composition (blocs et visuels déjà validés). */
export interface ProjectionStats {
  chapters: number;
  /** Blocs d'étapes dépendantes (procédure, calcul pas à pas, chronologie). */
  steps: number;
  /** Représentations utiles : figures, tableaux, comparaisons, proportions, graphiques. */
  visuals: number;
  /** Paragraphes de texte courant. */
  paragraphs: number;
}

const BY_MODE: Record<string, Projection> = { livre: "book", parcours: "guided", atelier: "visual" };

export function autoProjection(mode: string | null, s: ProjectionStats): { projection: Projection; reason: ProjectionReason } {
  if (mode && BY_MODE[mode]) return { projection: BY_MODE[mode], reason: "mode" };
  const chapters = Math.max(1, s.chapters);
  if (s.steps >= Math.max(2, chapters * 0.5)) return { projection: "guided", reason: "steps" };
  // Une longueur élevée ne suffit pas : il faut des représentations disponibles.
  if (s.visuals >= Math.max(3, chapters * 1.5) && s.visuals * 2 >= s.paragraphs) return { projection: "visual", reason: "visuals" };
  return { projection: "book", reason: "default" };
}

export function resolveProjection(choice: ProjectionChoice, mode: string | null, s: ProjectionStats) {
  return choice === "auto" ? autoProjection(mode, s) : { projection: choice, reason: null };
}

export function isProjectionChoice(v: unknown): v is ProjectionChoice {
  return v === "auto" || PROJECTIONS.includes(v as Projection);
}
