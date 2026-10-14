/**
 * Parcours IA par forfait (spécification du 14 octobre 2026, § 3). Quatre niveaux techniques :
 * « free », « plus » (Plus, ancienne offre Essentiel et mode Recharge), « pro » et « max ». Ils
 * bornent des ressources (appels experts, secours d'image) ; l'OCR est ouvert à tous, compté
 * dans le devis et borné par les limites du forfait.
 *
 * Droit Pro interne : les adresses de LIMPID_INTERNAL_PRO_EMAILS (par défaut
 * gooroosapio@gmail.com) reçoivent le parcours Pro et des plafonds de création élevés mais
 * bornés. Ce n'est ni un abonnement, ni un faux paiement : l'offre réelle reste inchangée.
 */
import { PLANS, type PlanCode } from "./catalog";

export type AiTier = "free" | "plus" | "pro" | "max";
export type ReaderApproach = "auto" | "livre" | "parcours" | "atelier";

const DEFAULT_INTERNAL_PRO = "gooroosapio@gmail.com";

export function internalProEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.LIMPID_INTERNAL_PRO_EMAILS?.trim() || DEFAULT_INTERNAL_PRO;
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}

export function isInternalPro(email: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  return !!email && internalProEmails(env).includes(email.trim().toLowerCase());
}

/** Nouvelles générations par période du droit Pro interne (élevées, bornées). */
export const INTERNAL_PRO_GENERATIONS = 300;

/** Niveau IA d'une offre ; Essentiel et le mode Recharge suivent le parcours Plus. */
export function aiTier(plan: PlanCode, mode: "free" | "subscription" | "topup", internalPro = false): AiTier {
  if (internalPro) return "pro";
  if (mode === "free") return "free";
  if (plan === "pro" || plan === "max") return plan;
  return "plus";
}

const TIER_PLAN: Record<AiTier, PlanCode> = { free: "free", plus: "plus", pro: "pro", max: "max" };

/**
 * Visuels par cours, couverture éventuelle comprise (lecteur V3, § 6). Pour les cours au prix
 * continu, ce plafond ne vaut que pour les schémas SVG ; les images raster suivent le devis (G).
 */
const IMAGE_CAPS: Record<ReaderApproach, Record<AiTier, number>> = {
  auto: { free: 2, plus: 5, pro: 10, max: 10 },
  livre: { free: 2, plus: 4, pro: 8, max: 8 },
  parcours: { free: 2, plus: 3, pro: 6, max: 6 },
  atelier: { free: 2, plus: 5, pro: 10, max: 10 },
};

export function imageCap(tier: AiTier, approach: string | null | undefined): number {
  const a = (approach && approach in IMAGE_CAPS ? approach : "auto") as ReaderApproach;
  return IMAGE_CAPS[a][tier];
}

/** Images IA nouvelles par chapitre : 1 en parcours guidé, 2 sinon. */
export function imagesPerChapter(approach: string | null | undefined): number {
  return approach === "parcours" ? 1 : 2;
}

/** Secours d'image (GPT Image 2) par cours, en plus du plafond d'un secours par image. */
export function imageFallbackCap(tier: AiTier): number {
  return tier === "pro" || tier === "max" ? 3 : tier === "plus" ? 2 : 1;
}

/** Interventions ciblées de Sol par cours (difficulté réelle seulement) : 0, 1, 3 ou 5. */
export function expertCalls(tier: AiTier): number {
  return PLANS[TIER_PLAN[tier]].limits.expertPerCourse;
}

/** Lecture des pages scannées (OCR) : tous les forfaits, dans leurs limites de pages. */
export function ocrAllowed(_tier: AiTier): boolean {
  return true;
}
