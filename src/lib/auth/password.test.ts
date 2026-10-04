import { describe, expect, it } from "vitest";
import { passwordProblem, sessionMethods } from "./password";

describe("règles de mot de passe", () => {
  it("accepte un mot de passe correct et refuse les cas faibles", () => {
    expect(passwordProblem("Lumiere-du-matin-42", "marie@exemple.fr")).toBeNull();
    expect(passwordProblem("court", "marie@exemple.fr")).toMatch(/10 caractères/);
    expect(passwordProblem("1234567890123", "marie@exemple.fr")).toMatch(/chiffres/);
    expect(passwordProblem("Marie-2026-secret", "marie@exemple.fr")).toMatch(/adresse/);
    expect(passwordProblem("aaaaaaaaaaaa", "marie@exemple.fr")).toMatch(/répétitif/);
  });
});

describe("méthodes de la session", () => {
  const token = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;
  it("lit la revendication amr du jeton", () => {
    expect(sessionMethods(token({ amr: [{ method: "recovery", timestamp: 1 }] }))).toEqual(["recovery"]);
    expect(sessionMethods(token({ amr: [{ method: "otp" }] }))).toEqual(["otp"]);
    expect(sessionMethods("pas-un-jeton")).toEqual([]);
    expect(sessionMethods(undefined)).toEqual([]);
  });
});
