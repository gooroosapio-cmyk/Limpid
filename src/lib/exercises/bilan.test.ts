import { describe, expect, it } from "vitest";
import type { Exercise } from "@/lib/contracts/schemas";
import { gradeBilan, publicQuestion } from "./bilan";

const base = { prompt: "Q ?", objective: "o", notion: null, evidence_ids: [], options: [], truth: null, items: [], pairs: [], blanks: [], expected: null, rubric: [], explanation: "Parce que." };
const single = (id: string, section: string): Exercise => ({ ...base, id, kind: "single", section_id: section, options: [{ text: "A", correct: false, why: "w" }, { text: "B", correct: true, why: "w" }, { text: "C", correct: false, why: "w" }] });
const short: Exercise = { ...base, id: "ex_s", kind: "short", section_id: "sec_2", expected: "Une idée." };

describe("bilan final", () => {
  it("aucune réponse ni correction envoyée au navigateur", () => {
    const q = publicQuestion(single("ex_1", "sec_1"));
    expect(JSON.stringify(q)).not.toMatch(/correct|why|Parce que/);
    expect(q.options.map((o) => o.text).sort()).toEqual(["A", "B", "C"]);
    expect(publicQuestion(short).scored).toBe(false);
  });

  it("note au dixième, réponse libre hors note, état par chapitre", () => {
    const ex = [single("ex_1", "sec_1"), single("ex_2", "sec_1"), single("ex_3", "sec_2"), short];
    const r = gradeBilan(ex, { ex_1: { kind: "single", choice: 1 }, ex_2: { kind: "single", choice: 0 }, ex_3: { kind: "single", choice: 1 }, ex_s: { kind: "short", text: "x" } }, ["sec_1", "sec_2", "sec_3"]);
    expect(r).toMatchObject({ score: 2, total: 3, on20: 13.3 });
    expect(r.chapters.map((c) => c.state)).toEqual(["a_revoir", "reussi", "non_evalue"]);
    expect(r.questions.find((q) => q.id === "ex_s")).toMatchObject({ correct: null, scored: false, solution: "Une idée." });
    expect(r.questions[1]).toMatchObject({ correct: false, solution: "B", explanation: "Parce que." });
  });

  it("sans réponse : compté faux, jamais réussi", () => {
    const r = gradeBilan([single("ex_1", "sec_1")], {}, ["sec_1"]);
    expect(r).toMatchObject({ score: 0, total: 1, on20: 0 });
    expect(r.questions[0]!.answered).toBe(false);
  });
});
