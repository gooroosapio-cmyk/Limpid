/**
 * Bilan de compréhension final (kit V5, § 04) : les questions partent vers le navigateur sans
 * leurs réponses ; la note est calculée par le serveur, au dixième (2/3 → 13,3/20), après la
 * soumission. Barème fixé avant la tentative : 1 point par question objective, tout ou rien,
 * aucune pénalité ; une réponse libre est corrigée à part et n'entre pas dans la note.
 */
import type { Exercise } from "@/lib/contracts/schemas";
import { grade, shuffled, type Answer } from "./grade";

/** Question telle qu'envoyée au lecteur : aucune bonne réponse ni correction. */
export interface PublicQuestion {
  id: string;
  kind: Exercise["kind"];
  prompt: string;
  section_id: string;
  notion: string | null;
  /** single / multiple : propositions mélangées ; `index` = position d'origine (réponse envoyée). */
  options: { index: number; text: string }[];
  /** order : éléments mélangés. */
  items: string[];
  /** match : colonne de gauche et propositions de droite mélangées. */
  lefts: string[];
  rights: string[];
  /** cloze : nombre de trous. */
  blanks: number;
  /** Réponse libre : hors note. */
  scored: boolean;
}

export function publicQuestion(ex: Exercise): PublicQuestion {
  return {
    id: ex.id,
    kind: ex.kind,
    prompt: ex.prompt,
    section_id: ex.section_id,
    notion: ex.notion,
    options: shuffled(ex.options.map((o, index) => ({ index, text: o.text })), `${ex.id}-o`),
    items: ex.kind === "order" ? shuffled(ex.items, ex.id) : [],
    lefts: ex.pairs.map((p) => p.left),
    rights: ex.kind === "match" ? shuffled(ex.pairs.map((p) => p.right), `${ex.id}-r`) : [],
    blanks: ex.blanks.length,
    scored: ex.kind !== "short",
  };
}

export interface QuestionResult {
  id: string;
  section_id: string;
  /** null : non noté (réponse libre) ou sans réponse comptée fausse ? → voir `answered`. */
  correct: boolean | null;
  answered: boolean;
  scored: boolean;
  /** Bonne réponse lisible et explication du raisonnement. */
  solution: string;
  explanation: string;
}

export type ChapterState = "reussi" | "a_revoir" | "non_evalue";

export interface BilanResult {
  score: number;
  total: number;
  /** Sur 20, au dixième. */
  on20: number;
  questions: QuestionResult[];
  chapters: { section_id: string; state: ChapterState; good: number; total: number }[];
}

/** Réponse attendue, lisible (correction après soumission). */
export function solutionText(ex: Exercise): string {
  switch (ex.kind) {
    case "single":
    case "multiple":
      return ex.options.filter((o) => o.correct).map((o) => o.text).join(" · ");
    case "truefalse":
      return ex.truth ? "Vrai" : "Faux";
    case "order":
      return ex.items.join(" → ");
    case "match":
      return ex.pairs.map((p) => `${p.left} → ${p.right}`).join(" · ");
    case "cloze":
      return ex.blanks.map((b) => b[0]).join(" · ");
    case "short":
      return ex.expected ?? "";
  }
}

export function gradeBilan(exercises: Exercise[], answers: Record<string, Answer | undefined>, chapterOrder: string[]): BilanResult {
  const questions: QuestionResult[] = exercises.map((ex) => {
    const a = answers[ex.id];
    const scored = ex.kind !== "short";
    const g = a && scored ? grade(ex, a) : null;
    return {
      id: ex.id,
      section_id: ex.section_id,
      correct: scored ? (g?.correct ?? false) : null,
      answered: !!a,
      scored,
      solution: solutionText(ex),
      explanation: ex.explanation,
    };
  });
  const scoredQ = questions.filter((q) => q.scored);
  const score = scoredQ.filter((q) => q.correct).length;
  const total = scoredQ.length;
  const on20 = total ? Math.round((score / total) * 200) / 10 : 0;
  const chapters = chapterOrder.map((section_id) => {
    const mine = scoredQ.filter((q) => q.section_id === section_id);
    const good = mine.filter((q) => q.correct).length;
    const state: ChapterState = mine.length === 0 ? "non_evalue" : good === mine.length ? "reussi" : "a_revoir";
    return { section_id, state, good, total: mine.length };
  });
  return { score, total, on20, questions, chapters };
}
