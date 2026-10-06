import { describe, expect, it } from "vitest";
import type { Exercise } from "@/lib/contracts/schemas";
import { formatOn20, notionSummary, scoreOn20 } from "./score";

const q = (id: string, notion: string | null, section = "sec_1") => ({ id, notion, section_id: section, objective: "obj" }) as Exercise;

describe("note sur 20 et bilan par notion", () => {
  it("8 réponses justes sur 10 donnent 16 / 20 ; les réponses non évaluées sont écartées", () => {
    const r = Array.from({ length: 10 }, (_, i) => ({ id: `ex_${i}`, correct: i < 8, ratio: null }));
    expect(scoreOn20(r)).toEqual({ good: 8, graded: 10, on20: 16 });
    expect(scoreOn20([...r, { id: "ex_x", correct: null, ratio: null }]).graded).toBe(10);
    expect(scoreOn20([{ id: "a", correct: true, ratio: 1 }, { id: "b", correct: true, ratio: 1 }, { id: "c", correct: false, ratio: 0 }]).on20).toBe(13.5);
    expect(scoreOn20([]).on20).toBeNull();
    expect(formatOn20(13.5, "fr")).toBe("13,5");
  });

  it("solide à partir de trois quarts de réponses justes, notions à revoir d'abord", () => {
    const questions = [q("ex_1", "Capacité"), q("ex_2", "Capacité"), q("ex_3", "Gain net", "sec_2"), q("ex_4", null, "sec_3")];
    const out = notionSummary(
      questions,
      [
        { id: "ex_1", correct: true, ratio: 1 },
        { id: "ex_2", correct: true, ratio: 1 },
        { id: "ex_3", correct: false, ratio: 0 },
        { id: "ex_4", correct: true, ratio: 1 },
      ],
      { sec_3: "Le débit" },
    );
    expect(out.map((n) => [n.label, n.status])).toEqual([["Gain net", "a_revoir"], ["Capacité", "solide"], ["Le débit", "solide"]]);
    expect(out[0]!.sectionId).toBe("sec_2");
  });
});
