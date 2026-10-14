import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({}) }));

import { ACTION_PRICES, ENGINE_MAX_CONTENT_PAGES, maxContentPages, PLANS, PRODUCT_CODES, product, reportsFor, sourcePages, TOPUPS } from "./catalog";
import { contentPages, nominalCredits, prudentCostXof, quoteCourse, supportAddonCredits } from "./quote";
import { addMonths, cycleBounds, quotaBlock, quotaState, resolvePlan } from "./wallet";

describe("catalogue (grille du 14 octobre 2026)", () => {
  it("offres : prix, crédits mensuels et équivalents en cours de 40 pages", () => {
    expect([PLANS.plus.monthlyXof, PLANS.pro.monthlyXof, PLANS.max.monthlyXof]).toEqual([4_900, 9_900, 14_900]);
    expect([PLANS.free, PLANS.plus, PLANS.pro, PLANS.max].map((p) => p.monthlyCredits)).toEqual([20, 350, 700, 1_050]);
    expect([PLANS.plus, PLANS.pro, PLANS.max].map((p) => reportsFor(p.monthlyCredits))).toEqual([21, 43, 65]);
    // Annuel : douze mois pour le prix de dix.
    for (const p of [PLANS.essential, PLANS.plus, PLANS.pro, PLANS.max]) expect(p.yearlyXof).toBe(p.monthlyXof * 10);
    // Limites par période et par cours.
    expect([PLANS.free, PLANS.plus, PLANS.pro, PLANS.max].map((p) => p.limits.generationsPerPeriod)).toEqual([2, 20, 40, 60]);
    expect([PLANS.free, PLANS.plus, PLANS.pro, PLANS.max].map((p) => p.limits.imagesPerCourse)).toEqual([0, 1, 2, 3]);
    expect([PLANS.free, PLANS.plus, PLANS.pro, PLANS.max].map((p) => p.limits.expertPerCourse)).toEqual([0, 1, 3, 5]);
    // Capacité du moteur : jamais au-delà de 150 pages de contenu par cours pour l'instant.
    expect(["free", "plus", "pro", "max"].map((p) => maxContentPages(p as "free"))).toEqual([40, ENGINE_MAX_CONTENT_PAGES, ENGINE_MAX_CONTENT_PAGES, ENGINE_MAX_CONTENT_PAGES]);
  });
  it("recharges : pas en dessous de 1 000 FCFA", () => {
    expect(Object.values(TOPUPS).map((t) => t.xof)).toEqual([1_000, 2_500, 5_000]);
    expect(reportsFor(TOPUPS.topup_500.credits)).toBe(31);
  });
  it("onze produits (six abonnements vendus, Essentiel honoré, trois recharges), résolus côté serveur", () => {
    expect(PRODUCT_CODES).toHaveLength(11);
    for (const c of PRODUCT_CODES) expect(product(c)).not.toBeNull();
    expect(product("max_yearly")).toMatchObject({ kind: "subscription", plan: "max", period: "yearly", xof: 149_000, monthlyCredits: 1_050 });
    expect(product("plus_monthly")).toMatchObject({ kind: "subscription", plan: "plus", xof: 4_900, monthlyCredits: 350 });
    expect(product("topup_500")).toMatchObject({ kind: "topup", xof: 5_000, credits: 500 });
    expect(product("topup_30")).toBeNull();
    expect(product("admin")).toBeNull();
  });
  it("pages d'un document : pagination ou équivalent texte", () => {
    expect(sourcePages(6, 9_328)).toBe(6);
    expect(sourcePages(null, 9_328)).toBe(4);
    expect(sourcePages(2, 60_000)).toBe(6);
    expect([ACTION_PRICES.report_short, ACTION_PRICES.report_standard, ACTION_PRICES.report_long]).toEqual([8, 20, 60]);
  });
});

describe("prix continu d'un cours", () => {
  it("crédits nominaux : 6 + ceil(P/4) + 2R + 4H + 20G", () => {
    expect(nominalCredits({ P: 8, R: 0, H: 0, G: 0 })).toBe(8);
    expect(nominalCredits({ P: 40, R: 0, H: 0, G: 0 })).toBe(16);
    expect(nominalCredits({ P: 100, R: 0, H: 0, G: 0 })).toBe(31);
    expect(nominalCredits({ P: 40, R: 10, H: 0, G: 0 })).toBe(36);
    expect(nominalCredits({ P: 40, R: 0, H: 0, G: 1 })).toBe(36);
    expect(nominalCredits({ P: 0, R: 0, H: 0, G: 0 })).toBe(7);
  });
  it("le coût prudent (marge comprise) ne dépasse pas le nominal dans les scénarios standards", () => {
    for (const P of [8, 40, 100, 150]) expect(quoteCourse({ P, R: 0, H: 0, G: 0 }).credits).toBe(nominalCredits({ P, R: 0, H: 0, G: 0 }));
    // Simulation § 12.1 : 40 pages et une image ≈ 80,64 FCFA.
    expect(prudentCostXof({ P: 40, R: 0, H: 0, G: 1 })).toBeCloseTo(80.64, 1);
    expect(quoteCourse({ P: 40, R: 0, H: 0, G: 1 }).credits).toBe(36);
  });
  it("le coût prudent relève le prix quand il dépasse le nominal", () => {
    const q = quoteCourse({ P: 1, R: 0, H: 60, G: 0 });
    expect(q.credits).toBe(Math.max(q.nominal, Math.ceil(q.prudentXof / 3)));
    expect(q.credits).toBeGreaterThanOrEqual(q.nominal);
  });
  it("pages de contenu normalisées : pages du PDF, ou 800 jetons par page si le texte est dense", () => {
    expect(contentPages({ pages: 40, chars: 40_000, ocrPages: 0 })).toBe(40);
    expect(contentPages({ pages: 10, chars: 64_000, ocrPages: 0 })).toBe(20);
    expect(contentPages({ pages: null, chars: 6_400, ocrPages: 0 })).toBe(2);
    expect(contentPages({ pages: 12, chars: 3_200, ocrPages: 10 })).toBe(12);
    expect(contentPages({ pages: null, chars: 0, ocrPages: 0 })).toBe(1);
  });
  it("support ajouté à un ancien cours : coût marginal", () => {
    expect([supportAddonCredits(8), supportAddonCredits(40), supportAddonCredits(150)]).toEqual([3, 4, 10]);
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

describe("limite de nouveaux cours par période", () => {
  it("cycle mensuel depuis l'ancre, fin de mois ramenée comme en base", () => {
    expect(addMonths(new Date("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    const c = cycleBounds(new Date("2026-08-15T09:00:00Z"), new Date("2026-10-14T12:00:00Z"));
    expect(c.start.toISOString()).toBe("2026-09-15T09:00:00.000Z");
    expect(c.end.toISOString()).toBe("2026-10-15T09:00:00.000Z");
    const edge = cycleBounds(new Date("2026-08-15T09:00:00Z"), new Date("2026-10-15T09:00:00Z"));
    expect(edge.start.toISOString()).toBe("2026-10-15T09:00:00.000Z");
  });
  it("compte les cours depuis le début de la période et annonce la date de levée", () => {
    const period = { start: new Date("2026-10-01T00:00:00Z"), end: new Date("2026-11-01T00:00:00Z") };
    const q = quotaState(["2026-10-07T08:00:00Z", "2026-09-30T08:00:00Z"], 2, period);
    expect(q.period).toMatchObject({ used: 1, limit: 2 });
    expect(quotaBlock(q)).toBeNull();
    const full = quotaState(["2026-10-07T08:00:00Z", "2026-10-08T08:00:00Z"], 2, period);
    expect(quotaBlock(full)).toEqual({ periodUsed: 2, periodLimit: 2, nextAt: "2026-11-01T00:00:00.000Z" });
  });
});

describe("réservations de rapports", () => {
  it("retrouve la clé de la tâche à partir de la clé de réservation", async () => {
    const { jobKeyOf } = await import("./wallet");
    expect(jobKeyOf("report:abc12345")).toBe("abc12345");
    expect(jobKeyOf("version:k-1")).toBe("k-1");
    expect(jobKeyOf("ask:uuid")).toBeNull();
  });
});

describe("enveloppe de coût par compte (§ 7)", () => {
  it("30 % du revenu reconnu, au moins 3 FCFA par crédit engagé ; annuel réparti sur 12 mois", async () => {
    const { envelopeXof, monthlyRevenueXof, overEnvelope, centsToXof } = await import("./envelope");
    expect(monthlyRevenueXof("plus", "monthly")).toBe(4_900);
    expect(monthlyRevenueXof("plus", "yearly")).toBeCloseTo(4_083.33, 1);
    expect(envelopeXof(4_900, 350)).toBe(1_470);
    expect(envelopeXof(0, 80)).toBe(240);
    expect(centsToXof(100)).toBeCloseTo(655.957, 2);
    expect(overEnvelope({ budgetXof: 240, spentXof: 200, exempt: false }, 10)).toBe(true);
    expect(overEnvelope({ budgetXof: 240, spentXof: 200, exempt: true }, 10)).toBe(false);
    expect(overEnvelope({ budgetXof: 240, spentXof: 100, exempt: false }, 10)).toBe(false);
  });
});
