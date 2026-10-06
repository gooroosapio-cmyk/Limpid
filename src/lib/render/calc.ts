/**
 * Calculs manipulables du lecteur (kit V6) : cinq opérations fixes, aucune expression du
 * modèle n'est évaluée (ni eval, ni Function). Un résultat impossible (division par zéro,
 * valeur non finie, pourcentage hors domaine) vaut null : « résultat indisponible ».
 */
import type { CALCULATIONS } from "@/lib/contracts/schemas";

export type FormulaId = (typeof CALCULATIONS)[number];

const finite = (n: number) => typeof n === "number" && Number.isFinite(n);

/** a, b : les deux variables dans l'ordre du bloc (share : a = total, b = pourcentage). */
export function computeCalculation(formula: FormulaId, a: number, b: number): number | null {
  if (!finite(a) || !finite(b)) return null;
  let r: number;
  switch (formula) {
    case "share":
      if (b < 0 || b > 100) return null;
      r = (a * b) / 100;
      break;
    case "sum":
      r = a + b;
      break;
    case "difference":
      r = a - b;
      break;
    case "ratio":
      if (b === 0) return null;
      r = a / b;
      break;
    case "percent_change":
      if (a === 0) return null;
      r = ((b - a) / a) * 100;
      break;
    default:
      return null;
  }
  return Number.isFinite(r) ? r : null;
}

/** Domaine d'une variable saisie : share impose un pourcentage entre 0 et 100. */
export function variableDomain(formula: FormulaId, index: number): { min?: number; max?: number } {
  if (formula === "share" && index === 1) return { min: 0, max: 100 };
  return {};
}

/** Une valeur saisie respecte-t-elle le domaine de sa variable ? */
export function inDomain(formula: FormulaId, index: number, value: number): boolean {
  if (!finite(value)) return false;
  const { min, max } = variableDomain(formula, index);
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

/** Formatage localisé (fr-FR par défaut), deux décimales au plus, sans « -0 ». */
export function formatNumber(n: number, locale = "fr-FR", digits = 2): string {
  const v = Object.is(n, -0) ? 0 : n;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v);
}

/** Expression lisible du calcul, valeurs formatées (jamais évaluée). */
export function formulaText(formula: FormulaId, a: number, b: number, locale = "fr-FR"): string {
  const f = (n: number) => formatNumber(n, locale);
  switch (formula) {
    case "share":
      return `${f(a)} × ${f(b)} / 100`;
    case "sum":
      return `${f(a)} + ${f(b)}`;
    case "difference":
      return `${f(a)} − ${f(b)}`;
    case "ratio":
      return `${f(a)} / ${f(b)}`;
    case "percent_change":
      return `(${f(b)} − ${f(a)}) / ${f(a)} × 100`;
  }
}

/** Part et reste d'un total pour un pourcentage (borné à 0..100). */
export function proportionParts(base: number, percent: number): { part: number; rest: number; percent: number } {
  const p = Math.min(100, Math.max(0, percent));
  const part = (base * p) / 100;
  return { part, rest: base - part, percent: p };
}

/**
 * Unité du résultat. Écart entre deux pourcentages : « points » (de pourcentage) ; variation
 * relative : « % ». Rapport de deux grandeurs de même unité : sans unité.
 */
export function resultUnit(formula: FormulaId, ua: string, ub: string): { unit: string; kind: "points" | "percent" | "plain" } {
  const pct = (u: string) => u.trim() === "%";
  switch (formula) {
    case "share":
      return { unit: ua, kind: "plain" };
    case "sum":
      return { unit: ua, kind: "plain" };
    case "difference":
      return pct(ua) && pct(ub) ? { unit: "points", kind: "points" } : { unit: ua, kind: "plain" };
    case "ratio":
      return { unit: ua.trim() === ub.trim() ? "" : ua && ub ? `${ua}/${ub}` : ua || "", kind: "plain" };
    case "percent_change":
      return { unit: "%", kind: "percent" };
  }
}
