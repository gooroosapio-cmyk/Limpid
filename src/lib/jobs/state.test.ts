import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, nextStage } from "./state";

describe("machine d'états des jobs", () => {
  it("autorise le parcours nominal", () => {
    expect(canTransition("queued", "running")).toBe(true);
    expect(canTransition("running", "succeeded")).toBe(true);
  });

  it("interdit de sortir d'un état terminal", () => {
    expect(canTransition("succeeded", "running")).toBe(false);
    expect(canTransition("cancelled", "queued")).toBe(false);
    expect(() => assertTransition("succeeded", "queued")).toThrow();
  });

  it("une extraction partielle n'avance qu'après confirmation", () => {
    expect(canTransition("awaiting_confirmation", "running")).toBe(false);
    expect(canTransition("awaiting_confirmation", "queued")).toBe(true);
  });

  it("enchaîne les étapes dans l'ordre", () => {
    expect(nextStage("validation")).toBe("extraction");
    expect(nextStage("mise_en_page")).toBeNull();
  });
});
