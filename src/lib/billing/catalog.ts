/**
 * Catalogue Limpid (spécification « Comptes, crédits, Chariow », § 1 à 3) : offres, recharges,
 * limites et prix fixes des actions en crédits. Seule source des montants : le navigateur
 * n'envoie jamais un prix, seulement un code produit.
 */

export type PlanCode = "free" | "essential" | "plus" | "pro";
export type PaidPlan = Exclude<PlanCode, "free">;
export type Period = "monthly" | "yearly";

/** Crédits d'un rapport standard : l'unité des équivalents « rapports » affichés. */
export const STANDARD_REPORT_CREDITS = 20;

export interface PlanDef {
  code: PlanCode;
  monthlyXof: number;
  yearlyXof: number;
  monthlyCredits: number;
  limits: {
    /** Limpid générés conservés (documents produits, hors sources). */
    keptReports: number;
    sourcesPerReport: number;
    concurrentJobs: number;
    /** Nouveaux rapports par semaine glissante ; null : pas de limite hebdomadaire. */
    weeklyReports: number | null;
  };
  watermark: boolean;
}

export const PLANS: Record<PlanCode, PlanDef> = {
  free: {
    code: "free",
    monthlyXof: 0,
    yearlyXof: 0,
    monthlyCredits: 80,
    limits: { keptReports: 3, sourcesPerReport: 1, concurrentJobs: 1, weeklyReports: 2 },
    watermark: true,
  },
  essential: {
    code: "essential",
    monthlyXof: 2_900,
    yearlyXof: 29_000,
    monthlyCredits: 240,
    limits: { keptReports: 30, sourcesPerReport: 5, concurrentJobs: 1, weeklyReports: null },
    watermark: false,
  },
  plus: {
    code: "plus",
    monthlyXof: 5_900,
    yearlyXof: 59_000,
    monthlyCredits: 600,
    limits: { keptReports: 100, sourcesPerReport: 5, concurrentJobs: 2, weeklyReports: null },
    watermark: false,
  },
  pro: {
    code: "pro",
    monthlyXof: 11_900,
    yearlyXof: 119_000,
    monthlyCredits: 1_500,
    limits: { keptReports: 300, sourcesPerReport: 5, concurrentJobs: 3, weeklyReports: null },
    watermark: false,
  },
};

export const PAID_PLANS: PaidPlan[] = ["essential", "plus", "pro"];

export type TopupCode = "topup_70" | "topup_180" | "topup_500";
export const TOPUPS: Record<TopupCode, { code: TopupCode; xof: number; credits: number }> = {
  topup_70: { code: "topup_70", xof: 1_000, credits: 70 },
  topup_180: { code: "topup_180", xof: 2_500, credits: 180 },
  topup_500: { code: "topup_500", xof: 5_000, credits: 500 },
};
export const TOPUP_VALIDITY_MONTHS = 12;

/** Les neuf produits vendus sur Chariow. */
export type ProductCode = `${PaidPlan}_${Period}` | TopupCode;
export const PRODUCT_CODES: ProductCode[] = [
  "essential_monthly",
  "essential_yearly",
  "plus_monthly",
  "plus_yearly",
  "pro_monthly",
  "pro_yearly",
  "topup_70",
  "topup_180",
  "topup_500",
];

export type Product =
  | { code: ProductCode; kind: "subscription"; plan: PaidPlan; period: Period; xof: number; monthlyCredits: number }
  | { code: ProductCode; kind: "topup"; xof: number; credits: number };

export function product(code: string): Product | null {
  if (code in TOPUPS) {
    const t = TOPUPS[code as TopupCode];
    return { code: t.code, kind: "topup", xof: t.xof, credits: t.credits };
  }
  const m = /^(essential|plus|pro)_(monthly|yearly)$/.exec(code);
  if (!m) return null;
  const plan = PLANS[m[1] as PaidPlan];
  const period = m[2] as Period;
  return {
    code: code as ProductCode,
    kind: "subscription",
    plan: plan.code as PaidPlan,
    period,
    xof: period === "yearly" ? plan.yearlyXof : plan.monthlyXof,
    monthlyCredits: plan.monthlyCredits,
  };
}

/** Prix fixes des actions (§ 3). */
export const ACTION_PRICES = {
  report_short: 8,
  report_standard: 20,
  report_long: 40,
  /** Nouvelle version complète d'un rapport existant (autre approche, autre formulation). */
  report_version: 8,
  ask: 1,
  quiz: 3,
} as const;
export type Action = keyof typeof ACTION_PRICES;
export type ReportAction = "report_short" | "report_standard" | "report_long";

/** Taille du texte lu (en caractères) au-delà de laquelle un rapport n'est plus court / devient long. */
export const SHORT_MAX_CHARS = 6_000;
export const LONG_MIN_CHARS = 90_000;

/** Devis d'un nouveau rapport selon la taille réelle du texte lu (mesurée côté serveur). */
export function reportAction(chars: number): ReportAction {
  if (chars <= SHORT_MAX_CHARS) return "report_short";
  if (chars > LONG_MIN_CHARS) return "report_long";
  return "report_standard";
}

/** Équivalent en rapports standard d'une quantité de crédits (affichage). */
export function reportsFor(credits: number): number {
  return Math.floor(credits / STANDARD_REPORT_CREDITS);
}

export function formatXof(n: number, lang: "fr" | "en" = "fr"): string {
  return `${n.toLocaleString(lang === "fr" ? "fr-FR" : "en-US").replace(/ /g, " ")} FCFA`;
}
