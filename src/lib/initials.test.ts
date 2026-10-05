import { describe, expect, it } from "vitest";
import { initials } from "./initials";

describe("initiales de l'avatar", () => {
  it("nom affiché prioritaire, sinon l'adresse", () => {
    expect(initials("Awa Diallo", "x@y.z")).toBe("AD");
    expect(initials("Moussa", "x@y.z")).toBe("M");
    expect(initials(null, "awa.diallo@example.com")).toBe("AD");
    expect(initials("  ", "kofi@example.com")).toBe("KO");
  });
});
