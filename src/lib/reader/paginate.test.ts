import { describe, expect, it } from "vitest";
import { paginate, viewOf, type PieceMetrics } from "./paginate";

const p = (height: number, o: Partial<PieceMetrics> = {}): PieceMetrics => ({ height, ...o });

describe("pagination mesurée du lecteur", () => {
  it("remplit chaque vue sans dépasser la hauteur utile", () => {
    const views = paginate([p(300), p(300), p(300), p(300), p(100)], 700);
    expect(views.map((v) => [v.start, v.end])).toEqual([[0, 1], [2, 4]]);
    expect(views.every((v) => v.height <= 700)).toBe(true);
  });

  it("garde un titre avec le début de son contenu", () => {
    const views = paginate([p(500), p(80, { keepWithNext: true }), p(300), p(100)], 700);
    // Le titre (index 1) aurait tenu seul en bas de la première vue : il passe avec son contenu.
    expect(views.map((v) => [v.start, v.end])).toEqual([[0, 0], [1, 3]]);
  });

  it("garde plusieurs titres consécutifs ensemble avec leur contenu", () => {
    const views = paginate([p(400), p(60, { keepWithNext: true }), p(60, { keepWithNext: true }), p(400)], 700);
    expect(views.map((v) => [v.start, v.end])).toEqual([[0, 0], [1, 3]]);
  });

  it("respecte les coupures forcées (couverture, point de contrôle)", () => {
    const views = paginate([p(200, { breakAfter: true }), p(100), p(100), p(150, { breakBefore: true, breakAfter: true }), p(100)], 700);
    expect(views.map((v) => [v.start, v.end])).toEqual([[0, 0], [1, 2], [3, 3], [4, 4]]);
  });

  it("donne sa propre vue défilante à une pièce plus haute que l'écran, sans la couper", () => {
    const views = paginate([p(200), p(1500), p(200)], 700);
    expect(views.map((v) => [v.start, v.end, v.oversized])).toEqual([
      [0, 0, false],
      [1, 1, true],
      [2, 2, false],
    ]);
  });

  it("place chaque pièce dans exactement une vue, dans l'ordre", () => {
    const heights = Array.from({ length: 60 }, (_, i) => p(40 + ((i * 97) % 500), { keepWithNext: i % 7 === 0, breakBefore: i % 13 === 0 }));
    for (const available of [320, 480, 640, 900]) {
      const views = paginate(heights, available);
      const covered = views.flatMap((v) => Array.from({ length: v.end - v.start + 1 }, (_, k) => v.start + k));
      expect(covered).toEqual(heights.map((_, i) => i));
      for (const v of views) if (!v.oversized) expect(v.height).toBeLessThanOrEqual(available);
      // Aucun titre seul en fin de vue s'il est suivi de contenu dans la même pièce de plan.
      for (const v of views) if (v.end > v.start && v.end < heights.length - 1) expect(heights[v.end]!.keepWithNext && !heights[v.end + 1]!.breakBefore).toBe(false);
    }
  });

  it("retrouve la vue d'une ancre", () => {
    const views = paginate([p(300), p(300), p(300)], 650);
    expect(viewOf(views, 2)).toBe(1);
    expect(viewOf(views, 99)).toBe(0);
  });
});
