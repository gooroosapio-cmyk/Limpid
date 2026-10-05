import { describe, expect, it } from "vitest";
import { isInteractive, sessionExempt, sessionIdOf, sessionPolicyOn } from "./sessions";

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
const jwt = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;

describe("sessions d'appareil", () => {
  it("activité de premier plan : navigation de page ou action, jamais un sondage ni un préchargement", () => {
    expect(isInteractive("GET", h({ "sec-fetch-dest": "document" }), "/")).toBe(true);
    expect(isInteractive("GET", h({ rsc: "1" }), "/rapports/x")).toBe(true);
    expect(isInteractive("POST", h({}), "/api/reports")).toBe(true);
    expect(isInteractive("GET", h({}), "/api/reports/x/progress")).toBe(false);
    expect(isInteractive("GET", h({ "sec-fetch-dest": "empty" }), "/api/wallet")).toBe(false);
    expect(isInteractive("GET", h({ rsc: "1", "next-router-prefetch": "1" }), "/")).toBe(false);
    expect(isInteractive("GET", h({ "sec-fetch-dest": "document", purpose: "prefetch" }), "/")).toBe(false);
  });
  it("machines (webhooks, cron) et déconnexion : hors contrôle", () => {
    expect(sessionExempt("/api/webhooks/chariow")).toBe(true);
    expect(sessionExempt("/api/worker")).toBe(true);
    expect(sessionExempt("/auth/deconnexion")).toBe(true);
    expect(sessionExempt("/compte")).toBe(false);
  });
  it("identifiant de session lu dans le jeton ; absent ou mal formé : rien", () => {
    expect(sessionIdOf(jwt({ session_id: "123e4567-e89b-12d3-a456-426614174000" }))).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(sessionIdOf(jwt({ session_id: "pas-un-uuid" }))).toBeNull();
    expect(sessionIdOf("n'importe quoi")).toBeNull();
    expect(sessionIdOf(null)).toBeNull();
  });
  it("politique active par défaut, coupure de secours explicite", () => {
    expect(sessionPolicyOn({})).toBe(true);
    expect(sessionPolicyOn({ LIMPID_SESSION_POLICY: "off" })).toBe(false);
  });
});
