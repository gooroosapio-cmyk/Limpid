import { describe, expect, it } from "vitest";
import { QUESTIONS, summarize } from "./preferences";

describe("préférences", () => {
  it("compte six questions, une seule à choix multiples", () => {
    expect(QUESTIONS).toHaveLength(6);
    expect(QUESTIONS.filter((q) => q.multiple).map((q) => q.id)).toEqual(["aids"]);
  });

  it("produit un résumé impersonnel", () => {
    expect(summarize({ aids: ["exemples"], minutes: ["3"] })).toBe("Exemples concrets · Lecture courte");
    expect(summarize({})).toBe("");
  });

  it("ne demande ni âge ni donnée sensible", () => {
    const all = JSON.stringify(QUESTIONS).toLowerCase();
    for (const mot of [/\bâge\b/, /\bans\b/, /diagnostic/, /handicap/, /intelligence/, /personnalité/]) {
      expect(all).not.toMatch(mot);
    }
  });
});
