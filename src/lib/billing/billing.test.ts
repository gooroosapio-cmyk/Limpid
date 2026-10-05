import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({}) }));

import { ACTION_PRICES, PLANS, PRODUCT_CODES, product, quotaWindows, reportAction, reportsFor, TOPUPS } from "./catalog";
import { quotaBlock, quotaState, resolvePlan } from "./wallet";

describe("catalogue (révision tarifaire)", () => {
  it("offres : prix, crédits mensuels et équivalents en rapports standard", () => {
    expect([PLANS.essential.monthlyXof, PLANS.plus.monthlyXof, PLANS.pro.monthlyXof]).toEqual([2_900, 5_900, 11_900]);
    expect([PLANS.free, PLANS.essential, PLANS.plus, PLANS.pro].map((p) => reportsFor(p.monthlyCredits))).toEqual([4, 12, 30, 75]);
    // Annuel : douze mois pour le prix de dix.
    for (const p of [PLANS.essential, PLANS.plus, PLANS.pro]) expect(p.yearlyXof).toBe(p.monthlyXof * 10);
    // Plafonds V2 : jour / semaine.
    expect([PLANS.free, PLANS.essential, PLANS.plus, PLANS.pro].map((p) => [p.limits.dailyReports, p.limits.weeklyReports])).toEqual([
      [2, 5],
      [5, 20],
      [10, 50],
      [20, 100],
    ]);
  });
  it("recharges : pas en dessous de 1 000 FCFA, 25 rapports pour 5 000", () => {
    expect(Object.values(TOPUPS).map((t) => t.xof)).toEqual([1_000, 2_500, 5_000]);
    expect(reportsFor(TOPUPS.topup_500.credits)).toBe(25);
  });
  it("neuf produits, tous résolus côté serveur ; un code inconnu ne vaut rien", () => {
    expect(PRODUCT_CODES).toHaveLength(9);
    for (const c of PRODUCT_CODES) expect(product(c)).not.toBeNull();
    expect(product("pro_yearly")).toMatchObject({ kind: "subscription", plan: "pro", period: "yearly", xof: 119_000, monthlyCredits: 1_500 });
    expect(product("topup_500")).toMatchObject({ kind: "topup", xof: 5_000, credits: 500 });
    expect(product("topup_30")).toBeNull();
    expect(product("admin")).toBeNull();
  });
  it("devis d'un rapport selon la taille réelle du texte lu", () => {
    expect(reportAction(3_000)).toBe("report_short");
    expect(reportAction(20_000)).toBe("report_standard");
    expect(reportAction(200_000)).toBe("report_long");
    expect([ACTION_PRICES.report_short, ACTION_PRICES.report_standard, ACTION_PRICES.report_long]).toEqual([8, 20, 40]);
  });
});

describe("offre active", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const sub = (plan: "plus" | "pro", from: string, to: string) => ({ plan, starts_at: from, ends_at: to, monthly_credits: 600 });
  const lot = (origin: string, available: number, expires: string, reserved = 0) => ({ origin, available, reserved, expires_at: expires });

  it("abonnement en cours = son offre ; un renouvellement futur ne compte pas encore", () => {
    const r = resolvePlan([sub("plus", "2026-10-01T00:00Z", "2026-11-01T00:00Z"), sub("pro", "2026-11-01T00:00Z", "2026-12-01T00:00Z")], [], now);
    expect(r).toMatchObject({ plan: "plus", mode: "subscription" });
  });
  it("abonnement expiré : retour au gratuit, les documents ne sont pas concernés", () => {
    expect(resolvePlan([sub("pro", "2026-08-01T00:00Z", "2026-09-01T00:00Z")], [], now)).toMatchObject({ plan: "free", mode: "free" });
  });
  it("mode Recharge tant qu'une recharge valide a des crédits disponibles ou engagés", () => {
    expect(resolvePlan([], [lot("topup", 10, "2027-10-01T00:00Z")], now)).toMatchObject({ mode: "topup", plan: "essential" });
    expect(resolvePlan([], [lot("topup", 0, "2027-10-01T00:00Z", 20)], now)).toMatchObject({ mode: "topup" });
    expect(resolvePlan([], [lot("topup", 0, "2027-10-01T00:00Z")], now)).toMatchObject({ mode: "free" });
    expect(resolvePlan([], [lot("topup", 50, "2026-10-01T00:00Z")], now)).toMatchObject({ mode: "free" });
  });
});

describe("plafonds jour et semaine (UTC)", () => {
  it("jour calendaire UTC, semaine du lundi 00:00 UTC", () => {
    const w = quotaWindows(new Date("2026-10-07T23:30:00Z")); // mercredi
    expect(w.dayStart.toISOString()).toBe("2026-10-07T00:00:00.000Z");
    expect(w.dayEnd.toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(w.weekStart.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(w.weekEnd.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    // Dimanche : encore la semaine commencée le lundi précédent.
    expect(quotaWindows(new Date("2026-10-11T12:00:00Z")).weekStart.toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });
  it("compte les rapports du jour et de la semaine", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const q = quotaState(["2026-10-07T08:00:00Z", "2026-10-06T08:00:00Z", "2026-10-04T08:00:00Z"], { day: 2, week: 5 }, now);
    expect(q.day).toMatchObject({ used: 1, limit: 2 });
    expect(q.week).toMatchObject({ used: 2, limit: 5 });
  });
  it("limite atteinte : la date donnée est celle où toutes les limites sont levées", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const dayOnly = quotaBlock(quotaState(["2026-10-07T08:00:00Z", "2026-10-07T09:00:00Z"], { day: 2, week: 5 }, now))!;
    expect(dayOnly).toMatchObject({ dayLimit: 2, weekLimit: undefined, nextAt: "2026-10-08T00:00:00.000Z" });
    const both = quotaBlock(quotaState(["2026-10-07T08:00:00Z", "2026-10-07T09:00:00Z"], { day: 2, week: 2 }, now))!;
    expect(both).toMatchObject({ dayLimit: 2, weekLimit: 2, nextAt: "2026-10-12T00:00:00.000Z" });
    expect(quotaBlock(quotaState([], { day: 2, week: 5 }, now))).toBeNull();
  });
});
