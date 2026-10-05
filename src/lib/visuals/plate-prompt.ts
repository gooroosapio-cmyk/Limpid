/** Grille et consigne d'une planche d'illustrations (sans dépendance native, testable). */

/** Illustrations au plus par planche (une seule génération). */
export const PLATE_MAX = 4;

export function plateGrid(n: number): { cols: number; rows: number; aspectRatio: "1:1" | "16:9" } {
  if (n <= 1) return { cols: 1, rows: 1, aspectRatio: "1:1" };
  if (n === 2) return { cols: 2, rows: 1, aspectRatio: "16:9" };
  if (n === 3) return { cols: 3, rows: 1, aspectRatio: "16:9" };
  return { cols: 2, rows: 2, aspectRatio: "1:1" };
}

/** Consigne de planche : brève, expurgée, sans texte ni chiffre, fond blanc pur à détourer. */
export function platePrompt(items: { subject: string; purpose: string; altText: string }[]): string {
  const { cols, rows } = plateGrid(items.length);
  const cells = items.map((it, i) => `Case ${i + 1} : ${it.subject}, pour montrer ${it.purpose} (éléments validés : ${it.altText}).`).join("\n");
  return `Crée UNE planche d'illustrations pédagogiques : ${items.length} illustrations distinctes disposées en grille de ${cols} colonne(s) × ${rows} ligne(s), dans l'ordre de lecture (gauche à droite, puis haut en bas).
Chaque illustration est centrée dans sa case, entièrement visible, avec une marge blanche nette autour : elle ne touche ni les bords ni les illustrations voisines.
Fond blanc pur uniforme (#FFFFFF) partout, sans ombre portée, sans texture, sans cadre ni séparateur. Style éditorial simple au trait, aplats doux, palette encre, jaune doux et vert sauge.
Aucun texte, lettre, chiffre, logo ni détail documentaire inventé.
${cells}`;
}
