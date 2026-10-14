/**
 * Catalogue Limpid (spécification « Comptes, crédits, Chariow », § 1 à 3) : offres, recharges,
 * limites et prix fixes des actions en crédits. Seule source des montants : le navigateur
 * n'envoie jamais un prix, seulement un code produit.
 */

export type PlanCode = "free" | "essential" | "plus" | "pro" | "max";
export type PaidPlan = Exclude<PlanCode, "free">;
/** Offres vendues (Essentiel n'est plus vendu ; ses abonnements en cours restent honorés). */
export type SoldPlan = "plus" | "pro" | "max";
export type Period = "monthly" | "yearly";

/** Crédits d'un cours numérique standard de 40 pages : l'unité des équivalents affichés. */
export const STANDARD_REPORT_CREDITS = 16;

export interface PlanLimits {
  /** Limpid générés conservés (documents produits, hors sources). */
  keptReports: number;
  /** Fichiers réunis dans un même cours. */
  sourcesPerReport: number;
  /** Tâches de cours actives simultanément. */
  concurrentJobs: number;
  /** Nouvelles générations de cours par période (cycle du forfait). */
  generationsPerPeriod: number;
  /** Pages physiques par tâche (somme des fichiers). */
  physicalPagesPerTask: number;
  /** Pages de contenu normalisées par tâche (800 jetons par page). */
  contentPagesPerTask: number;
  /** Pages de contenu normalisées par période. */
  contentPagesPerPeriod: number;
  /** Taille maximale d'un fichier (Mo). */
  maxFileMb: number;
  /** Pages lues par OCR ou vision : par tâche et par période. */
  ocrPagesPerTask: number;
  ocrPagesPerPeriod: number;
  /** Pages manuscrites (comprises dans l'OCR) : par tâche et par période. */
  handwrittenPerTask: number;
  handwrittenPerPeriod: number;
  /** Nouvelles images générées (raster) : par cours et par période. */
  imagesPerCourse: number;
  imagesPerPeriod: number;
  /** Appels experts (Sol) au plus : par cours et par période. */
  expertPerCourse: number;
  expertPerPeriod: number;
  /** Stockage personnel (Mo). */
  storageMb: number;
}

export interface PlanDef {
  code: PlanCode;
  monthlyXof: number;
  yearlyXof: number;
  monthlyCredits: number;
  limits: PlanLimits;
  watermark: boolean;
}

/**
 * Grille de lancement (spécification du 14 octobre 2026, § 3). Les crédits et les autres limites
 * s'appliquent ensemble ; les plafonds techniques ne sont pas des allocations gratuites.
 */
export const PLANS: Record<PlanCode, PlanDef> = {
  free: {
    code: "free",
    monthlyXof: 0,
    yearlyXof: 0,
    /** Allocation mensuelle après le bonus de bienvenue (voir FREE_WELCOME). */
    monthlyCredits: 20,
    limits: {
      keptReports: 10, sourcesPerReport: 1, concurrentJobs: 1, generationsPerPeriod: 2,
      physicalPagesPerTask: 40, contentPagesPerTask: 40, contentPagesPerPeriod: 80, maxFileMb: 10,
      ocrPagesPerTask: 10, ocrPagesPerPeriod: 20, handwrittenPerTask: 5, handwrittenPerPeriod: 10,
      imagesPerCourse: 0, imagesPerPeriod: 0, expertPerCourse: 0, expertPerPeriod: 0, storageMb: 250,
    },
    watermark: true,
  },
  /** Ancienne offre, honorée jusqu'à la fin des abonnements payés ; plus vendue. */
  essential: {
    code: "essential",
    monthlyXof: 2_900,
    yearlyXof: 29_000,
    monthlyCredits: 240,
    limits: {
      keptReports: 100, sourcesPerReport: 3, concurrentJobs: 1, generationsPerPeriod: 20,
      physicalPagesPerTask: 200, contentPagesPerTask: 240, contentPagesPerPeriod: 1_500, maxFileMb: 30,
      ocrPagesPerTask: 80, ocrPagesPerPeriod: 160, handwrittenPerTask: 20, handwrittenPerPeriod: 40,
      imagesPerCourse: 1, imagesPerPeriod: 8, expertPerCourse: 1, expertPerPeriod: 6, storageMb: 2_048,
    },
    watermark: false,
  },
  plus: {
    code: "plus",
    monthlyXof: 4_900,
    yearlyXof: 49_000,
    monthlyCredits: 350,
    limits: {
      keptReports: 300, sourcesPerReport: 3, concurrentJobs: 1, generationsPerPeriod: 20,
      physicalPagesPerTask: 200, contentPagesPerTask: 240, contentPagesPerPeriod: 1_500, maxFileMb: 30,
      ocrPagesPerTask: 80, ocrPagesPerPeriod: 160, handwrittenPerTask: 20, handwrittenPerPeriod: 40,
      imagesPerCourse: 1, imagesPerPeriod: 8, expertPerCourse: 1, expertPerPeriod: 6, storageMb: 2_048,
    },
    watermark: false,
  },
  pro: {
    code: "pro",
    monthlyXof: 9_900,
    yearlyXof: 99_000,
    monthlyCredits: 700,
    limits: {
      keptReports: 1_000, sourcesPerReport: 5, concurrentJobs: 2, generationsPerPeriod: 40,
      physicalPagesPerTask: 400, contentPagesPerTask: 480, contentPagesPerPeriod: 3_000, maxFileMb: 60,
      ocrPagesPerTask: 200, ocrPagesPerPeriod: 400, handwrittenPerTask: 60, handwrittenPerPeriod: 120,
      imagesPerCourse: 2, imagesPerPeriod: 16, expertPerCourse: 3, expertPerPeriod: 15, storageMb: 5_120,
    },
    watermark: false,
  },
  max: {
    code: "max",
    monthlyXof: 14_900,
    yearlyXof: 149_000,
    monthlyCredits: 1_050,
    limits: {
      keptReports: 2_000, sourcesPerReport: 8, concurrentJobs: 3, generationsPerPeriod: 60,
      physicalPagesPerTask: 600, contentPagesPerTask: 720, contentPagesPerPeriod: 4_500, maxFileMb: 100,
      ocrPagesPerTask: 400, ocrPagesPerPeriod: 600, handwrittenPerTask: 120, handwrittenPerPeriod: 240,
      imagesPerCourse: 3, imagesPerPeriod: 24, expertPerCourse: 5, expertPerPeriod: 30, storageMb: 10_240,
    },
    watermark: false,
  },
};

/** Offres affichées et vendues. */
export const PAID_PLANS: SoldPlan[] = ["plus", "pro", "max"];

/** Gratuit : bonus de bienvenue unique (compte vérifié), puis allocation mensuelle de 20. */
export const FREE_WELCOME = { credits: 80, days: 90 };

export type TopupCode = "topup_70" | "topup_180" | "topup_500";
export const TOPUPS: Record<TopupCode, { code: TopupCode; xof: number; credits: number }> = {
  topup_70: { code: "topup_70", xof: 1_000, credits: 70 },
  topup_180: { code: "topup_180", xof: 2_500, credits: 180 },
  topup_500: { code: "topup_500", xof: 5_000, credits: 500 },
};
export const TOPUP_VALIDITY_MONTHS = 12;

/** Produits Chariow : les six abonnements vendus, les recharges et l'ancienne offre Essentiel. */
export type ProductCode = `${PaidPlan}_${Period}` | TopupCode;
export const PRODUCT_CODES: ProductCode[] = [
  "essential_monthly",
  "essential_yearly",
  "plus_monthly",
  "plus_yearly",
  "pro_monthly",
  "pro_yearly",
  "max_monthly",
  "max_yearly",
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
  const m = /^(essential|plus|pro|max)_(monthly|yearly)$/.exec(code);
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

/**
 * Prix fixes des actions annexes. Un cours se paie au prix continu (« report », montant calculé
 * par quoteCourse, voir quote.ts) ; les anciens paliers restent reconnus pour les réservations et
 * l'historique existants.
 */
export const ACTION_PRICES = {
  /** Anciens paliers (réservations antérieures à la grille du 14 octobre 2026). */
  report_short: 8,
  report_standard: 20,
  report_long: 60,
  report_xl: 120,
  /** Nouvelle formulation d'un chapitre (« Plus simple », « Un autre exemple »). */
  report_version: 2,
  ask: 1,
  quiz: 3,
  /** Anciens prix des supports payants (cours antérieurs aux supports inclus). */
  support_short: 2,
  support_standard: 4,
  support_long: 10,
  support_xl: 18,
} as const;
export type FixedAction = keyof typeof ACTION_PRICES;
/** « report » : cours au prix continu ; « support » : ajout d'un support à un ancien cours. */
export type Action = FixedAction | "report" | "support";
/** Actions qui comptent comme une nouvelle génération de cours dans la limite de période. */
export const COURSE_ACTIONS: Action[] = ["report", "report_short", "report_standard", "report_long", "report_xl"];

/** Une page équivalente de texte (document sans pagination, texte collé, page web). */
export const CHARS_PER_PAGE = 2_500;
/**
 * Capacité actuelle du moteur (environ 400 000 caractères de source) : au-delà, le document est
 * refusé avec un message clair, quel que soit le forfait.
 */
export const ENGINE_MAX_CONTENT_PAGES = 150;

/** Pages de contenu autorisées par tâche pour un forfait (plafond du forfait et du moteur). */
export function maxContentPages(plan: PlanCode): number {
  return Math.min(PLANS[plan].limits.contentPagesPerTask, ENGINE_MAX_CONTENT_PAGES);
}

/** Pages d'un document : sa pagination si elle existe, sinon l'équivalent texte (au moins 1). */
export function sourcePages(pageCount: number | null | undefined, chars: number): number {
  const byText = Math.max(1, Math.ceil(chars / CHARS_PER_PAGE));
  return pageCount && pageCount > 0 ? Math.max(pageCount, Math.min(byText, pageCount * 3)) : byText;
}

/** Équivalent en rapports standard d'une quantité de crédits (affichage). */
export function reportsFor(credits: number): number {
  return Math.floor(credits / STANDARD_REPORT_CREDITS);
}

export function formatXof(n: number, lang: "fr" | "en" = "fr"): string {
  return `${n.toLocaleString(lang === "fr" ? "fr-FR" : "en-US").replace(/ /g, " ")} FCFA`;
}
