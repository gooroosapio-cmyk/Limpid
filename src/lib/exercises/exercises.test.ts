import { describe, expect, it } from "vitest";
import { demoExplanation, demoKnowledge, demoEvidence } from "@/lib/demo/cycle-eau";
import type { Exercise } from "@/lib/contracts/schemas";
import { bilanSize, ExerciseDraft, normalizeExercises } from "@/lib/engine/exercises";
import { grade, loose, shuffled } from "./grade";

const base = {
  objective: "Comprendre l'évaporation",
  notion: "évaporation",
  section_id: demoExplanation.sections[0]!.id,
  evidence_ids: [],
  options: [],
  truth: null,
  items: [],
  pairs: [],
  blanks: [],
  expected: null,
  rubric: [],
  explanation: "Parce que la chaleur du Soleil transforme l'eau en vapeur.",
};
const opt = (text: string, correct: boolean) => ({ text, correct, why: `${text} : justification.` });

describe("contrôle des exercices générés", () => {
  const evidenceIds = new Set(demoEvidence.map((e) => e.id));
  const n = bilanSize(demoExplanation, demoKnowledge);

  it("taille du bilan : de 5 à 25 selon les notions", () => {
    expect(n).toBeGreaterThanOrEqual(5);
    expect(n).toBeLessThanOrEqual(25);
  });

  it("garde les questions bien formées et écarte les autres", () => {
    const draft = ExerciseDraft.parse({
      checkpoints: [{ section_id: demoExplanation.sections[0]!.id, exercises: [{ ...base, kind: "single", prompt: "Qu'est-ce qui fait monter l'eau ?", options: [opt("La chaleur", true), opt("Le vent", false), opt("La lune", false)] }] }],
      bilan: [
        { ...base, kind: "single", prompt: "Deux bonnes réponses ?", options: [opt("A", true), opt("B", true), opt("C", false)] },
        { ...base, kind: "multiple", prompt: "Lesquelles sont des précipitations ? (plusieurs réponses)", options: [opt("Pluie", true), opt("Neige", true), opt("Vapeur", false)] },
        { ...base, kind: "truefalse", prompt: "L'eau de mer est salée.", truth: true },
        { ...base, kind: "truefalse", prompt: "Sans valeur.", truth: null },
        { ...base, kind: "order", prompt: "Remettez dans l'ordre", items: ["Évaporation", "Condensation", "Précipitations"] },
        { ...base, kind: "match", prompt: "Associez", pairs: [{ left: "Évaporation", right: "liquide → vapeur" }, { left: "Condensation", right: "vapeur → gouttes" }, { left: "Précipitations", right: "chute de l'eau" }] },
        { ...base, kind: "cloze", prompt: "L'eau ___ sous l'effet du Soleil.", blanks: [["s'évapore", "s evapore"]] },
        { ...base, kind: "cloze", prompt: "Trous ___ et ___ mais une seule réponse.", blanks: [["a"]] },
        { ...base, kind: "short", prompt: "Expliquez avec vos mots le cycle de l'eau.", expected: "L'eau s'évapore, se condense puis retombe.", rubric: ["évaporation", "condensation", "précipitations"] },
        { ...base, kind: "single", prompt: "Quelle part de l'eau est salée ?", options: [opt("123456 %", true), opt("1 %", false), opt("50 %", false)] },
        { ...base, kind: "truefalse", prompt: "L'eau de mer est salée.", truth: true },
      ],
      insufficient: false,
    });
    const set = normalizeExercises(draft, demoExplanation, demoKnowledge, evidenceIds, n, "claire");
    const kinds = set.bilan.map((q) => q.kind);
    expect(kinds).toEqual(["multiple", "truefalse", "order", "match", "cloze", "short"]);
    expect(set.checkpoints).toHaveLength(1);
    // Chiffre absent de l'explication et doublon écartés.
    expect(set.bilan.some((q) => q.prompt.includes("Quelle part"))).toBe(false);
    expect(set.bilan.filter((q) => q.prompt === "L'eau de mer est salée.")).toHaveLength(1);
    // Moins de 5 questions utilisables : bilan annoncé comme insuffisant.
    expect(set.insufficient).toBe(false);
    expect(new Set([...set.bilan, ...set.checkpoints.flatMap((c) => c.exercises)].map((q) => q.id)).size).toBe(7);
  });
});

describe("correction déterministe", () => {
  const q = (over: Partial<Exercise>): Exercise => ({ id: "ex_1", kind: "single", prompt: "?", ...base, ...over }) as Exercise;

  it("corrige QCM, vrai/faux, classement, association et texte à trous", () => {
    expect(grade(q({ options: [opt("a", false), opt("b", true)] }), { kind: "single", choice: 1 })?.correct).toBe(true);
    const multi = q({ kind: "multiple", options: [opt("a", true), opt("b", true), opt("c", false)] });
    expect(grade(multi, { kind: "multiple", choices: [0, 1] })?.correct).toBe(true);
    expect(grade(multi, { kind: "multiple", choices: [0] })).toEqual({ correct: false, ratio: 2 / 3 });
    expect(grade(q({ kind: "truefalse", truth: false }), { kind: "truefalse", value: false })?.correct).toBe(true);
    expect(grade(q({ kind: "order", items: ["a", "b", "c"] }), { kind: "order", order: ["a", "c", "b"] })?.ratio).toBeCloseTo(1 / 3);
    const match = q({ kind: "match", pairs: [{ left: "x", right: "1" }, { left: "y", right: "2" }] });
    expect(grade(match, { kind: "match", pairs: { x: "1", y: "2" } })?.correct).toBe(true);
    expect(grade(q({ kind: "cloze", blanks: [["s'évapore"]] }), { kind: "cloze", values: ["  S’EVAPORE. "] })?.correct).toBe(true);
    expect(grade(q({ kind: "short" }), { kind: "short", text: "…" })).toBeNull();
    expect(grade(q({}), { kind: "truefalse", value: true })).toBeNull();
  });

  it("compare sans tenir compte des accents ni de la casse", () => {
    expect(loose("  Évaporation ! ")).toBe("evaporation");
  });

  it("mélange de façon stable sans jamais redonner l'ordre attendu", () => {
    const items = ["a", "b", "c", "d"];
    expect(shuffled(items, "x")).toEqual(shuffled(items, "x"));
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      expect(shuffled(items, seed)).not.toEqual(items);
      expect([...shuffled(items, seed)].sort()).toEqual(items);
    }
  });
});
