/**
 * Géométrie des graphiques du lecteur V6 (barres, courbe), calculée par le code à partir des
 * valeurs exactes : ligne de base à zéro, barres négatives sous la ligne de base, ordre
 * d'origine conservé, aucune ligne tracée à travers une valeur absente.
 */

export interface ChartFrame {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const FRAME: ChartFrame = { width: 360, height: 220, left: 44, right: 12, top: 16, bottom: 40 };

/** Pas « rond » (1, 2, 2,5, 5 × 10^n) pour environ `count` intervalles. */
function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

export interface Scale {
  lo: number;
  hi: number;
  ticks: number[];
  y: (v: number) => number;
}

/** Échelle verticale incluant toujours zéro, bornes arrondies au pas. */
export function yScale(values: number[], frame: ChartFrame = FRAME): Scale {
  let lo = Math.min(0, ...values);
  let hi = Math.max(0, ...values);
  if (lo === hi) hi = lo + 1;
  const step = niceStep(hi - lo, 4);
  lo = Math.floor(lo / step + 1e-9) * step;
  hi = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : +v.toPrecision(12));
  const inner = frame.height - frame.top - frame.bottom;
  const y = (v: number) => frame.top + ((hi - v) / (hi - lo)) * inner;
  return { lo, hi, ticks, y };
}

/** Centre horizontal de chaque emplacement (ordre d'origine). */
export function slots(n: number, frame: ChartFrame = FRAME): { x: (i: number) => number; step: number } {
  const step = (frame.width - frame.left - frame.right) / Math.max(1, n);
  return { step, x: (i: number) => frame.left + step * (i + 0.5) };
}

/** Barre à extrémité arrondie (4 px), carrée sur la ligne de base ; négative sous la base. */
export function barPath(cx: number, width: number, base: number, top: number): string {
  const h = Math.abs(base - top);
  const x0 = cx - width / 2;
  const x1 = cx + width / 2;
  if (h < 0.5) return `M${x0},${base}H${x1}`;
  const r = Math.min(4, h, width / 2);
  const dir = top < base ? 1 : -1; // 1 : vers le haut
  const yEnd = top;
  const yIn = top + dir * r;
  return `M${x0},${base}V${yIn}Q${x0},${yEnd} ${x0 + r},${yEnd}H${x1 - r}Q${x1},${yEnd} ${x1},${yIn}V${base}Z`;
}

/** Tracé de courbe interrompu à chaque valeur absente (un nouveau « M » après un trou). */
export function linePath(points: { x: number; y: number | null }[]): string {
  let d = "";
  let pen = false;
  for (const p of points) {
    if (p.y === null) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${round(p.x)},${round(p.y)}`;
    pen = true;
  }
  return d;
}

/** Libellé raccourci pour tenir dans `width` px (le libellé complet reste dans le tableau). */
export function fitAxisLabel(label: string, width: number, charPx = 6.2): string {
  const max = Math.max(2, Math.floor(width / charPx));
  return label.length <= max ? label : `${label.slice(0, max - 1).trimEnd()}…`;
}

export const round = (n: number) => Math.round(n * 100) / 100;
