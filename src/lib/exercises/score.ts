/**
 * Note explicable (Atlas, § 04) : réponses justes ramenées sur 20, puis bilan par notion,
 * « Solide » ou « À revoir ». Une réponse libre non évaluée ne compte ni pour ni contre.
 */
import type { Exercise } from "@/lib/contracts/schemas";

export interface GradedAnswer {
  id: string;
  correct: boolean | null;
  ratio: number | null;
}

export interface Score {
  good: number;
  graded: number;
  /** Sur 20, arrondi au demi-point ; null si aucune réponse n'a pu être évaluée. */
  on20: number | null;
}

export function scoreOn20(results: GradedAnswer[]): Score {
  const graded = results.filter((r) => r.correct !== null);
  const good = graded.filter((r) => r.correct).length;
  return { good, graded: graded.length, on20: graded.length ? Math.round((good / graded.length) * 40) / 2 : null };
}

export interface NotionVerdict {
  key: string;
  label: string;
  sectionId: string;
  status: "solide" | "a_revoir";
  good: number;
  total: number;
}

/** Une notion est solide quand au moins trois quarts de ses questions évaluées sont justes. */
export function notionSummary(questions: Exercise[], results: GradedAnswer[], titles: Record<string, string>): NotionVerdict[] {
  const byId = new Map(results.map((r) => [r.id, r]));
  const groups = new Map<string, NotionVerdict>();
  for (const q of questions) {
    const r = byId.get(q.id);
    if (!r || r.correct === null) continue;
    const label = q.notion?.trim() || titles[q.section_id] || q.objective;
    const key = label.toLowerCase();
    const g = groups.get(key) ?? { key, label, sectionId: q.section_id, status: "solide" as const, good: 0, total: 0 };
    g.total++;
    if (r.correct) g.good++;
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, status: g.good / g.total >= 0.75 ? ("solide" as const) : ("a_revoir" as const) }))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "a_revoir" ? -1 : 1));
}

/** 16 → « 16 », 15.5 → « 15,5 » (fr) ou « 15.5 » (en). */
export function formatOn20(n: number, lang: "fr" | "en"): string {
  return Number.isInteger(n) ? String(n) : lang === "fr" ? String(n).replace(".", ",") : String(n);
}
