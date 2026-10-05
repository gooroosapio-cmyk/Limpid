import { describe, expect, it } from "vitest";
import { fitLabel, textEm, wrapEm } from "./wrap";

describe("coupure des libellés de schéma", () => {
  it("garde un libellé court sur une ligne, en grand", () => {
    expect(fitLabel("Évaporation", 196)).toEqual({ size: 17, lines: ["Évaporation"] });
  });

  it("coupe un libellé long sans rien perdre ni dépasser", () => {
    const text = "Condensation de la vapeur en gouttelettes nuageuses";
    const { size, lines } = fitLabel(text, 196);
    expect(lines.join(" ")).toBe(text);
    for (const l of lines) expect(textEm(l) * size).toBeLessThanOrEqual(196);
  });

  it("réduit la taille quand un mot seul est trop large, puis le scinde en dernier recours", () => {
    expect(fitLabel("Anticonstitutionnellement", 196).size).toBeLessThan(17);
    const lines = wrapEm("Anticonstitutionnellementissimement", 8);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.map((l) => l.replace(/-$/, "")).join("")).toBe("Anticonstitutionnellementissimement");
    for (const l of lines) expect(textEm(l)).toBeLessThanOrEqual(8);
  });
});
