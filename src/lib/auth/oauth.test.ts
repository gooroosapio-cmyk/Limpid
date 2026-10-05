import { describe, expect, it } from "vitest";
import { enabledProviders, isOAuthProvider, OAUTH_SCOPES } from "./oauth";

describe("connexion Google et Apple", () => {
  it("aucun bouton tant qu'un fournisseur n'est pas déclaré configuré", () => {
    expect(enabledProviders({})).toEqual([]);
    expect(enabledProviders({ LIMPID_AUTH_GOOGLE: "1" })).toEqual([]);
    expect(enabledProviders({ LIMPID_AUTH_GOOGLE: "on" })).toEqual(["google"]);
    expect(enabledProviders({ LIMPID_AUTH_GOOGLE: "on", LIMPID_AUTH_APPLE: "on" })).toEqual(["google", "apple"]);
  });
  it("fournisseurs connus seulement, portées minimales", () => {
    expect(isOAuthProvider("google")).toBe(true);
    expect(isOAuthProvider("github")).toBe(false);
    expect(OAUTH_SCOPES.google).not.toMatch(/gmail|drive|contacts/i);
  });
});
