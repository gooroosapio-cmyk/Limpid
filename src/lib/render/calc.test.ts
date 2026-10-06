import { describe, expect, it } from "vitest";
import { computeCalculation, formatNumber, formulaText, inDomain, proportionParts, resultUnit } from "./calc";

describe("calculs manipulables (kit V6)", () => {
  it("calcule une part d'un total", () => {
    expect(computeCalculation("share", 200, 30)).toBe(60);
    expect(computeCalculation("share", 200, 0)).toBe(0);
    expect(computeCalculation("share", 200, 100)).toBe(200);
  });

  it("refuse un pourcentage hors domaine pour une part", () => {
    expect(computeCalculation("share", 200, 120)).toBeNull();
    expect(computeCalculation("share", 200, -1)).toBeNull();
    expect(inDomain("share", 1, 101)).toBe(false);
    expect(inDomain("share", 0, -5)).toBe(true);
  });

  it("additionne, soustrait et divise", () => {
    expect(computeCalculation("sum", 2.5, 3)).toBe(5.5);
    expect(computeCalculation("difference", 10, 14)).toBe(-4);
    expect(computeCalculation("ratio", 9, 3)).toBe(3);
  });

  it("rend null pour une division par zéro", () => {
    expect(computeCalculation("ratio", 9, 0)).toBeNull();
    expect(computeCalculation("percent_change", 0, 5)).toBeNull();
  });

  it("calcule une variation relative en %", () => {
    expect(computeCalculation("percent_change", 200, 250)).toBe(25);
    expect(computeCalculation("percent_change", 200, 150)).toBe(-25);
  });

  it("rend null pour une entrée non finie", () => {
    expect(computeCalculation("sum", Number.NaN, 1)).toBeNull();
    expect(computeCalculation("sum", Number.POSITIVE_INFINITY, 1)).toBeNull();
    expect(computeCalculation("sum", Number.MAX_VALUE, Number.MAX_VALUE)).toBeNull();
  });

  it("distingue points de pourcentage et pourcentage", () => {
    expect(resultUnit("difference", "%", "%").kind).toBe("points");
    expect(resultUnit("percent_change", "€", "€")).toEqual({ unit: "%", kind: "percent" });
    expect(resultUnit("ratio", "€", "€").unit).toBe("");
    expect(resultUnit("share", "€", "%").unit).toBe("€");
  });

  it("formate en fr-FR sans évaluer d'expression", () => {
    expect(formatNumber(1234.5).replace(/\s/g, " ")).toBe("1 234,5");
    expect(formatNumber(-0)).toBe("0");
    expect(formulaText("share", 200, 30)).toBe("200 × 30 / 100");
    expect(formulaText("percent_change", 200, 250)).toBe("(250 − 200) / 200 × 100");
  });

  it("borne la proportion et calcule le reste", () => {
    expect(proportionParts(200, 30)).toEqual({ part: 60, rest: 140, percent: 30 });
    expect(proportionParts(200, 140).percent).toBe(100);
  });
});
