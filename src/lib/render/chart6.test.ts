import { describe, expect, it } from "vitest";
import { barPath, fitAxisLabel, linePath, yScale } from "./chart6";

describe("géométrie des graphiques V6", () => {
  it("inclut toujours zéro dans l'échelle", () => {
    const s = yScale([12, 30, 18]);
    expect(s.lo).toBe(0);
    expect(s.hi).toBeGreaterThanOrEqual(30);
    expect(s.ticks).toContain(0);
  });

  it("gère les valeurs négatives (barres divergentes)", () => {
    const s = yScale([-8, 5]);
    expect(s.lo).toBeLessThanOrEqual(-8);
    expect(s.hi).toBeGreaterThanOrEqual(5);
    // Une barre négative descend sous la ligne de base.
    const base = s.y(0);
    expect(s.y(-8)).toBeGreaterThan(base);
    expect(barPath(100, 20, base, s.y(-8))).toMatch(/^M90,/);
  });

  it("n'invente aucune liaison à travers une valeur absente", () => {
    const d = linePath([{ x: 0, y: 10 }, { x: 10, y: 20 }, { x: 20, y: null }, { x: 30, y: 5 }, { x: 40, y: 6 }]);
    expect(d).toBe("M0,10L10,20M30,5L40,6");
    expect(linePath([{ x: 0, y: null }, { x: 10, y: 3 }])).toBe("M10,3");
  });

  it("rend une échelle valide pour des valeurs toutes nulles", () => {
    const s = yScale([0, 0]);
    expect(s.hi).toBeGreaterThan(s.lo);
  });

  it("raccourcit un libellé trop long", () => {
    expect(fitAxisLabel("Janvier", 60)).toBe("Janvier");
    expect(fitAxisLabel("Une catégorie très longue", 40).endsWith("…")).toBe(true);
  });
});
