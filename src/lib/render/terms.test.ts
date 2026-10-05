import { describe, expect, it } from "vitest";
import { splitTerms, termMatcher } from "./terms";

describe("splitTerms", () => {
  const terms = ["chaleur", "énergie interne", "énergie"];
  const m = termMatcher(terms);

  it("souligne la première occurrence de chaque notion, mot entier", () => {
    const used = new Set<string>();
    expect(splitTerms("La chaleur réchauffe ; la chaleur passe.", m, terms, used)).toEqual([
      "La ",
      { term: "chaleur", text: "chaleur" },
      " réchauffe ; la chaleur passe.",
    ]);
    expect(splitTerms("Encore la chaleur.", m, terms, used)).toEqual(["Encore la chaleur."]);
  });

  it("préfère la notion la plus longue et ignore les mots partiels", () => {
    expect(splitTerms("L'énergie interne et les énergies.", m, terms, new Set())).toEqual([
      "L'",
      { term: "énergie interne", text: "énergie interne" },
      " et les énergies.",
    ]);
  });

  it("garde la casse du texte et échappe les caractères spéciaux", () => {
    const special = ["C++ (langage)"];
    expect(splitTerms("Chaleur et C++ (langage).", termMatcher([...terms, ...special]), [...terms, ...special], new Set())).toEqual([
      { term: "chaleur", text: "Chaleur" },
      " et ",
      { term: "C++ (langage)", text: "C++ (langage)" },
      ".",
    ]);
  });

  it("sans notion, renvoie le texte tel quel", () => {
    expect(splitTerms("Texte", termMatcher([]), [], new Set())).toEqual(["Texte"]);
  });
});
