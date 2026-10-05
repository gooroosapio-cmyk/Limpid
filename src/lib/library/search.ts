/**
 * Recherche de la bibliothèque (V5, § 6) : locale, instantanée, sans requête IA ni réseau
 * pendant la saisie. Accents et casse ignorés. Règles de repli du champ en fonction du clavier.
 */

/** Forme comparable : sans accents, minuscules, espaces simples. */
export function foldText(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Tous les mots de la requête apparaissent dans le texte (ordre libre). */
export function matchesQuery(text: string, query: string): boolean {
  const q = foldText(query);
  if (!q) return true;
  const t = foldText(text);
  return q.split(" ").every((w) => t.includes(w));
}

export interface SearchUiState {
  query: string;
  /** Clavier virtuel ouvert (déduit de la zone visible), si on sait le mesurer. */
  keyboardOpen: boolean;
  /** Le clavier virtuel a été vu ouvert depuis l'ouverture de la recherche. */
  keyboardSeen: boolean;
  /** Le focus est dans la zone de recherche (champ ou suggestions). */
  focusInside: boolean;
}

/**
 * Faut-il replier le champ ?
 * - texte non vide : jamais (la recherche active reste visible) ;
 * - téléphone (clavier vu) : replié quand le clavier est refermé, même si le focus reste ;
 * - ordinateur (aucun clavier virtuel) : replié seulement quand le focus quitte la zone.
 */
export function shouldCollapse(s: SearchUiState): boolean {
  if (s.query.trim()) return false;
  if (s.keyboardSeen) return !s.keyboardOpen;
  return !s.focusInside;
}

/** Clavier virtuel probablement ouvert : la zone visible a perdu une hauteur notable. */
export function keyboardLikelyOpen(layoutHeight: number, visibleHeight: number, scale = 1): boolean {
  // Un zoom (scale > 1) réduit aussi la zone visible : il ne compte pas comme un clavier.
  if (scale > 1.05) return false;
  return layoutHeight - visibleHeight > Math.max(120, layoutHeight * 0.18);
}
