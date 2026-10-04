/**
 * QCM de préférences (payload 1, § 3) : six questions, profil explicite uniquement.
 * Aucun âge, diagnostic ou inférence sensible.
 */
export type QuestionId = "goal" | "familiarity" | "aids" | "minutes" | "density" | "example_domain";

export interface Question {
  id: QuestionId;
  title: string;
  multiple: boolean;
  options: { value: string; label: string; summary: string }[];
}

export const QUESTIONS: Question[] = [
  {
    id: "goal",
    title: "Que cherchez-vous à faire le plus souvent ?",
    multiple: false,
    options: [
      { value: "comprendre", label: "Comprendre", summary: "Pour comprendre" },
      { value: "reviser", label: "Réviser", summary: "Pour réviser" },
      { value: "appliquer", label: "Appliquer", summary: "Pour appliquer" },
      { value: "decider", label: "Décider", summary: "Pour décider" },
    ],
  },
  {
    id: "familiarity",
    title: "En général, quelle familiarité avec les sujets que vous importez ?",
    multiple: false,
    options: [
      { value: "aucune", label: "Aucune", summary: "Sujets nouveaux" },
      { value: "bases", label: "Quelques bases", summary: "Quelques bases" },
      { value: "maitrise", label: "Bonne maîtrise", summary: "Bonne maîtrise" },
    ],
  },
  {
    id: "aids",
    title: "Qu'est-ce qui aide le plus à comprendre ?",
    multiple: true,
    options: [
      { value: "analogies", label: "Des analogies simples", summary: "Analogies" },
      { value: "exemples", label: "Des exemples concrets", summary: "Exemples concrets" },
      { value: "schemas", label: "Des schémas", summary: "Schémas" },
      { value: "texte", label: "Du texte clair", summary: "Texte" },
    ],
  },
  {
    id: "minutes",
    title: "Combien de temps de lecture, à peu près ?",
    multiple: false,
    options: [
      { value: "3", label: "3 minutes", summary: "Lecture courte" },
      { value: "7", label: "7 minutes", summary: "Lecture moyenne" },
      { value: "12", label: "12 minutes", summary: "Lecture longue" },
    ],
  },
  {
    id: "density",
    title: "Quelle densité préférez-vous ?",
    multiple: false,
    options: [
      { value: "essentiel", label: "L'essentiel", summary: "L'essentiel" },
      { value: "equilibre", label: "Équilibré", summary: "Équilibré" },
      { value: "approfondi", label: "Approfondi", summary: "Approfondi" },
    ],
  },
  {
    id: "example_domain",
    title: "Quels exemples vous parlent le plus ?",
    multiple: false,
    options: [
      { value: "quotidien", label: "La vie quotidienne", summary: "Exemples du quotidien" },
      { value: "travail", label: "Le travail", summary: "Exemples du travail" },
      { value: "sciences", label: "Les sciences", summary: "Exemples scientifiques" },
      { value: "sans_preference", label: "Sans préférence", summary: "" },
    ],
  },
];

export type Answers = Partial<Record<QuestionId, string[]>>;

/** Résumé impersonnel, par exemple « Exemples concrets · Lecture courte ». */
export function summarize(answers: Answers): string {
  const parts: string[] = [];
  for (const q of QUESTIONS) {
    for (const v of answers[q.id] ?? []) {
      const s = q.options.find((o) => o.value === v)?.summary;
      if (s) parts.push(s);
    }
  }
  return parts.join(" · ");
}
