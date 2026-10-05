/**
 * Correction déterministe des exercices objectifs (V4) : aucune requête IA. Les réponses
 * libres (« short ») sont évaluées à part, avec une grille, et présentées comme incertaines.
 */
import type { Exercise } from "@/lib/contracts/schemas";

export type Answer =
  | { kind: "single"; choice: number }
  | { kind: "multiple"; choices: number[] }
  | { kind: "truefalse"; value: boolean }
  | { kind: "order"; order: string[] }
  | { kind: "match"; pairs: Record<string, string> }
  | { kind: "cloze"; values: string[] }
  | { kind: "short"; text: string };

export interface Grade {
  correct: boolean;
  /** Part juste (0 à 1), utile pour les réponses partielles. */
  ratio: number;
}

/** Écriture comparable : casse, accents, espaces et ponctuation finale ignorés. */
export function loose(t: string): string {
  return t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[\s.!?;:,]+$/g, "")
    .trim();
}

export function grade(ex: Exercise, a: Answer): Grade | null {
  if (a.kind !== ex.kind) return null;
  switch (a.kind) {
    case "single": {
      const ok = ex.options[a.choice]?.correct === true;
      return { correct: ok, ratio: ok ? 1 : 0 };
    }
    case "multiple": {
      const picked = new Set(a.choices);
      const right = ex.options.filter((o, i) => o.correct === picked.has(i)).length;
      return { correct: right === ex.options.length, ratio: right / ex.options.length };
    }
    case "truefalse": {
      const ok = ex.truth === a.value;
      return { correct: ok, ratio: ok ? 1 : 0 };
    }
    case "order": {
      const right = ex.items.filter((it, i) => a.order[i] === it).length;
      return { correct: right === ex.items.length, ratio: right / ex.items.length };
    }
    case "match": {
      const right = ex.pairs.filter((p) => a.pairs[p.left] === p.right).length;
      return { correct: right === ex.pairs.length, ratio: right / ex.pairs.length };
    }
    case "cloze": {
      const right = ex.blanks.filter((accepted, i) => accepted.some((x) => loose(x) === loose(a.values[i] ?? ""))).length;
      return { correct: right === ex.blanks.length, ratio: right / Math.max(1, ex.blanks.length) };
    }
    case "short":
      return null;
  }
}

/** Ordre de présentation stable qui ne révèle pas la réponse (mélange déterministe). */
export function shuffled<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  // Jamais l'ordre exact de la réponse attendue (sauf liste d'un seul élément).
  if (out.length > 1 && out.every((x, i) => x === items[i])) out.push(out.shift()!);
  return out;
}
