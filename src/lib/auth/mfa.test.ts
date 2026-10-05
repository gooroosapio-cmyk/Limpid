import { describe, expect, it } from "vitest";
import { adminMfaRequired, mfaStep, qrDataUrl, totpCode } from "./mfa";

describe("double authentification de l'administration", () => {
  it("exigée par défaut, coupée seulement par LIMPID_ADMIN_MFA=off", () => {
    expect(adminMfaRequired({})).toBe(true);
    expect(adminMfaRequired({ LIMPID_ADMIN_MFA: "on" })).toBe(true);
    expect(adminMfaRequired({ LIMPID_ADMIN_MFA: "off" })).toBe(false);
  });
  it("étape selon la session : aal2 passe, facteur vérifié → code, sinon → configuration", () => {
    expect(mfaStep({ currentLevel: "aal2", nextLevel: "aal2" }, true)).toBe("ok");
    expect(mfaStep({ currentLevel: "aal1", nextLevel: "aal2" }, true)).toBe("verify");
    expect(mfaStep({ currentLevel: "aal1", nextLevel: "aal1" }, true)).toBe("enroll");
    expect(mfaStep(null, true)).toBe("enroll");
    expect(mfaStep({ currentLevel: "aal1", nextLevel: "aal1" }, false)).toBe("ok");
  });
  it("code TOTP : 6 chiffres, espaces tolérés", () => {
    expect(totpCode("123 456")).toBe("123456");
    expect(totpCode("12345")).toBeNull();
    expect(totpCode("12345a")).toBeNull();
    expect(totpCode(null)).toBeNull();
  });
  it("QR code : adresse data: conservée, SVG brut encodé", () => {
    expect(qrDataUrl("data:image/svg+xml;utf-8,<svg/>")).toBe("data:image/svg+xml;utf-8,<svg/>");
    expect(qrDataUrl("<svg/>")).toBe("data:image/svg+xml;utf-8,%3Csvg%2F%3E");
  });
});
