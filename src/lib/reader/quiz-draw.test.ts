import { describe, expect, it } from "vitest";
import { drawLot, lotSize } from "./quiz-draw";

const pool = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `q_${i + 1}`,
    choices: ["A", "B", "C", "D"],
    correct_index: i % 4,
    explanations: ["eA", "eB", "eC", "eD"],
  }));

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

describe("tirage du mini-QCM", () => {
  it("2 questions par visite, 3 si la banque est riche, jamais plus que la banque", () => {
    expect([0, 1, 2, 5, 6, 8].map(lotSize)).toEqual([0, 1, 2, 2, 3, 3]);
  });

  it("garde la bonne réponse et son explication après mélange des choix", () => {
    for (let s = 1; s < 30; s++) {
      for (const q of drawLot(pool(8), [], seeded(s))) {
        const original = pool(8).find((p) => p.id === q.id)!;
        expect(q.choices[q.correct_index]).toBe(original.choices[original.correct_index]);
        expect(q.explanations[q.correct_index]).toBe(`e${original.choices[original.correct_index]}`);
      }
    }
  });

  it("évite le lot précédent quand la banque le permet", () => {
    const first = drawLot(pool(8), [], seeded(7)).map((q) => q.id);
    const next = drawLot(pool(8), first, seeded(11)).map((q) => q.id);
    expect(next.some((id) => first.includes(id))).toBe(false);
    // Banque de 3 : le lot suivant reprend forcément une question déjà vue.
    const small = drawLot(pool(3), ["q_1", "q_2"], seeded(3)).map((q) => q.id);
    expect(small[0]).toBe("q_3");
    expect(small).toHaveLength(2);
  });
});
