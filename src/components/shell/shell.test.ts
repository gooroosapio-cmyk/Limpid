import { describe, expect, it } from "vitest";
import { keyboardOpen } from "./keyboard";

describe("clavier virtuel", () => {
  const base = { layoutHeight: 844, viewportHeight: 844, scale: 1, editableFocused: true };
  it("ouvert : hauteur visible réduite avec un champ actif", () => {
    expect(keyboardOpen({ ...base, viewportHeight: 500 })).toBe(true);
  });
  it("fermé alors que le champ reste actif : les barres reviennent", () => {
    expect(keyboardOpen(base)).toBe(false);
  });
  it("sans champ actif ou en zoom : jamais considéré ouvert", () => {
    expect(keyboardOpen({ ...base, viewportHeight: 500, editableFocused: false })).toBe(false);
    expect(keyboardOpen({ ...base, viewportHeight: 420, scale: 2 })).toBe(false);
  });
});
