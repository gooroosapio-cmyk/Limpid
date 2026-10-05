import { describe, expect, it } from "vitest";
import { passwordProblem, recentlyAuthenticated, sessionMethods } from "./password";

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

describe("réauthentification récente", () => {
  const token = (amr: unknown) => `x.${Buffer.from(JSON.stringify({ amr })).toString("base64url")}.y`;
  const now = 1_800_000_000_000;
  it("exige une connexion de moins de 15 minutes", () => {
    expect(recentlyAuthenticated(token([{ method: "password", timestamp: now / 1000 - 60 }]), 900, now)).toBe(true);
    expect(recentlyAuthenticated(token([{ method: "password", timestamp: now / 1000 - 3600 }]), 900, now)).toBe(false);
    // La plus récente des méthodes compte (ex. récupération après un ancien mot de passe).
    expect(recentlyAuthenticated(token([{ method: "password", timestamp: now / 1000 - 9e5 }, { method: "recovery", timestamp: now / 1000 - 30 }]), 900, now)).toBe(true);
  });
  it("jeton illisible ou sans amr : refusé", () => {
    expect(recentlyAuthenticated("abc", 900, now)).toBe(false);
    expect(recentlyAuthenticated(token([]), 900, now)).toBe(false);
    expect(recentlyAuthenticated(undefined, 900, now)).toBe(false);
  });
});
