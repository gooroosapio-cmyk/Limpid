/**
 * Ordre de lecture d'une page PDF à deux colonnes (cahier V2, § 4 : « reconstruire l'ordre »).
 * Certains générateurs écrivent la page ligne par ligne à travers les colonnes ; le flux brut
 * mélange alors les deux textes. On détecte une gouttière verticale et on relit : titres
 * pleine largeur au-dessus, colonne gauche, colonne droite, puis pleine largeur en dessous.
 * Sans gouttière nette, l'ordre d'origine est conservé.
 */

export interface PositionedItem {
  str: string;
  /** Matrice de transformation pdf.js : [a, b, c, d, x, y]. */
  transform: number[];
  width: number;
}

interface Box {
  str: string;
  x: number;
  y: number;
  r: number;
}

/** Part maximale de texte pleine largeur (titres, encadrés) pour parler encore de colonnes. */
const MAX_SPANNING = 0.25;
/** Part minimale de texte de chaque côté de la gouttière. */
const MIN_SIDE = 0.2;

function lines(boxes: Box[]): string[] {
  const sorted = [...boxes].sort((a, b) => b.y - a.y || a.x - b.x);
  const out: Box[][] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0]!.y - b.y) <= 2) last.push(b);
    else out.push([b]);
  }
  return out.map((l) =>
    l
      .sort((a, b) => a.x - b.x)
      .map((b) => b.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/** Une vraie colonne de texte : au moins 6 lignes, remplies en moyenne aux deux tiers (un tableau n'y ressemble pas). */
function looksLikeColumn(boxes: Box[], from: number, to: number): boolean {
  const byLine = new Map<number, { x: number; r: number }>();
  for (const b of boxes) {
    const key = Math.round(b.y / 2);
    const l = byLine.get(key);
    byLine.set(key, l ? { x: Math.min(l.x, b.x), r: Math.max(l.r, b.r) } : { x: b.x, r: b.r });
  }
  const widths = [...byLine.values()].map((l) => (l.r - l.x) / Math.max(1, to - from)).sort((a, b) => a - b);
  return widths.length >= 6 && widths[Math.floor(widths.length / 2)]! >= 0.66;
}

/** Abscisse de la gouttière, ou null si la page n'est pas sur deux colonnes. */
export function findGutter(items: PositionedItem[], pageWidth: number): number | null {
  const boxes = items.filter((i) => i.str.trim()).map((i) => ({ x: i.transform[4]!, r: i.transform[4]! + i.width, n: i.str.trim().length }));
  const total = boxes.reduce((s, b) => s + b.n, 0);
  if (total < 200 || pageWidth <= 0) return null;
  let best: { g: number; spanning: number } | null = null;
  for (let g = pageWidth * 0.3; g <= pageWidth * 0.7; g += 2) {
    let left = 0;
    let right = 0;
    let spanning = 0;
    for (const b of boxes) {
      if (b.r <= g + 1) left += b.n;
      else if (b.x >= g - 1) right += b.n;
      else spanning += b.n;
    }
    if (left / total < MIN_SIDE || right / total < MIN_SIDE || spanning / total > MAX_SPANNING) continue;
    if (!best || spanning < best.spanning) best = { g, spanning };
  }
  return best ? Math.round(best.g) : null;
}

/** Texte de la page dans l'ordre de lecture (lignes séparées par des retours). */
export function columnText(items: PositionedItem[], pageWidth: number): string | null {
  const g = findGutter(items, pageWidth);
  if (g === null) return null;
  const boxes: Box[] = items.filter((i) => i.str.trim()).map((i) => ({ str: i.str, x: i.transform[4]!, y: i.transform[5]!, r: i.transform[4]! + i.width }));
  const left = boxes.filter((b) => b.r <= g + 1);
  const right = boxes.filter((b) => b.x >= g - 1 && b.r > g + 1);
  const spanning = boxes.filter((b) => b.r > g + 1 && b.x < g - 1);
  const cols = [...left, ...right];
  // Les colonnes doivent réellement se faire face (sinon : deux blocs l'un sous l'autre).
  const overlap = Math.min(Math.max(...left.map((b) => b.y)), Math.max(...right.map((b) => b.y))) - Math.max(Math.min(...left.map((b) => b.y)), Math.min(...right.map((b) => b.y)));
  if (overlap <= 0) return null;
  const minX = Math.min(...left.map((b) => b.x));
  const maxR = Math.max(...right.map((b) => b.r));
  if (!looksLikeColumn(left, minX, g) || !looksLikeColumn(right, Math.min(...right.map((b) => b.x)), maxR)) return null;
  const top = Math.max(...cols.map((b) => b.y));
  const bottom = Math.min(...cols.map((b) => b.y));
  const above = spanning.filter((b) => b.y > top);
  const below = spanning.filter((b) => b.y < bottom);
  const inside = spanning.filter((b) => b.y <= top && b.y >= bottom);
  return [...lines(above), ...lines([...left, ...inside.filter((b) => b.x < g)]), ...lines(right), ...lines(below)].join("\n");
}
