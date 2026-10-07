import { describe, expect, it } from "vitest";
import { profileOf, structureRoute } from "./routing";

describe("routage de la structure", () => {
  it("source standard → GLM, complexe → DeepSeek, avec la raison", () => {
    expect(structureRoute(profileOf(["Le cycle de l'eau décrit le trajet de l'eau."], 1))).toEqual({ role: "structure", reason: "source standard" });
    expect(structureRoute(profileOf(["a", "b"], 2)).role).toBe("structure_complex");
    expect(structureRoute(profileOf(["x".repeat(160_000)], 1)).reason).toBe("source longue");
    expect(structureRoute(profileOf(["Bilan : 200 000 × 80 / 100 = 160 000 ; TVA 20 % ; 45 000 + 12 500 = 57 500."], 1)).reason).toBe("chiffres et formules denses");
  });
});
