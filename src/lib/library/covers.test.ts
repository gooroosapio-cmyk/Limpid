import { describe, expect, it } from "vitest";
import { COVERS, coverFor, coverView, isCoverId } from "./covers";

describe("couvertures décoratives", () => {
  it("choix explicite respecté, sinon tirage stable par identifiant", () => {
    expect(coverFor("a", "verre")).toBe("verre");
    expect(coverFor("abc", null)).toBe(coverFor("abc", undefined));
    expect(COVERS).toContain(coverFor("00000000-0000-0000-0000-000000000001", "inconnue"));
  });
  it("aucune image annoncée tant qu'elle n'est pas livrée", () => {
    expect(coverView("papier").image).toBeNull();
    expect(isCoverId("../x")).toBe(false);
  });
});
