/**
 * Parcours IA par forfait (prompt V2, § II ; lecteur V3, § 6). Trois niveaux techniques :
 * « free » (Gratuit et Essentiel), « plus » et « pro ». Ils ouvrent des ressources (OCR, Sol,
 * nombre d'images) ; ils ne changent ni les prix ni les crédits commerciaux.
 *
 * Droit Pro interne : les adresses de LIMPID_INTERNAL_PRO_EMAILS (par défaut
 * gooroosapio@gmail.com) reçoivent le parcours Pro et des plafonds de création élevés mais
 * bornés. Ce n'est ni un abonnement, ni un faux paiement : l'offre réelle reste inchangée.
 */
import type { PlanCode } from "./catalog";

export type AiTier = "free" | "plus" | "pro";
export type ReaderApproach = "auto" | "livre" | "parcours" | "atelier";

const DEFAULT_INTERNAL_PRO = "gooroosapio@gmail.com";

export function internalProEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.LIMPID_INTERNAL_PRO_EMAILS?.trim() || DEFAULT_INTERNAL_PRO;
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}

export function isInternalPro(email: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  return !!email && internalProEmails(env).includes(email.trim().toLowerCase());
}

/** Plafonds de création du droit Pro interne (élevés, bornés). */
export const INTERNAL_PRO_QUOTAS = { day: 50, week: 300 };

/** Niveau IA d'une offre ; Essentiel suit le parcours Gratuit (choix du cadrage). */
export function aiTier(plan: PlanCode, mode: "free" | "subscription" | "topup", internalPro = false): AiTier {
  if (internalPro) return "pro";
  if (mode === "free") return "free";
  if (plan === "pro") return "pro";
  if (plan === "plus") return "plus";
  return "free";
}

/** Images IA originales par cours, couverture éventuelle comprise (lecteur V3, § 6). */
const IMAGE_CAPS: Record<ReaderApproach, Record<AiTier, number>> = {
  auto: { free: 2, plus: 5, pro: 10 },
  livre: { free: 2, plus: 4, pro: 8 },
  parcours: { free: 2, plus: 3, pro: 6 },
  atelier: { free: 2, plus: 5, pro: 10 },
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
  return tier === "pro" ? 3 : tier === "plus" ? 2 : 1;
}

/** Interventions ciblées de Sol par génération : Pro seulement, deux au plus. */
export function expertCalls(tier: AiTier): number {
  return tier === "pro" ? 2 : 0;
}

/** Lecture des pages scannées (OCR) : Pro seulement. */
export function ocrAllowed(tier: AiTier): boolean {
  return tier === "pro";
}
