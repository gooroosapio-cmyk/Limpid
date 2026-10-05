import { describe, expect, it } from "vitest";
import { foldText, keyboardLikelyOpen, matchesQuery, shouldCollapse } from "./search";

describe("recherche de la bibliothèque", () => {
  it("ignore accents, casse et ordre des mots", () => {
    expect(foldText("  Électricité  ÉTÉ ")).toBe("electricite ete");
    expect(matchesQuery("Bilan de l'eau potable à Clairval", "CLAIRVAL eau")).toBe(true);
    expect(matchesQuery("Bilan de l'eau", "elec")).toBe(false);
    expect(matchesQuery("Thermodynamique", "")).toBe(true);
  });

  it("replie un champ vide quand le clavier du téléphone se referme (R01), même avec le focus", () => {
    expect(shouldCollapse({ query: "", keyboardOpen: false, keyboardSeen: true, focusInside: true })).toBe(true);
    expect(shouldCollapse({ query: "", keyboardOpen: true, keyboardSeen: true, focusInside: true })).toBe(false);
  });

  it("garde une recherche non vide visible après fermeture du clavier (R02)", () => {
    expect(shouldCollapse({ query: "eau", keyboardOpen: false, keyboardSeen: true, focusInside: false })).toBe(false);
  });

  it("laisse un champ vide saisissable sur ordinateur tant que le focus y est (R05)", () => {
    expect(shouldCollapse({ query: "", keyboardOpen: false, keyboardSeen: false, focusInside: true })).toBe(false);
    expect(shouldCollapse({ query: "", keyboardOpen: false, keyboardSeen: false, focusInside: false })).toBe(true);
  });

  it("ne confond pas zoom ou barre du navigateur avec le clavier", () => {
    expect(keyboardLikelyOpen(800, 480)).toBe(true);
    expect(keyboardLikelyOpen(800, 740)).toBe(false); // barre d'adresse
    expect(keyboardLikelyOpen(800, 400, 2)).toBe(false); // zoom
  });
});
