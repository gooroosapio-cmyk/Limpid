/**
 * Estimation du coût d'un appel IA (cadrage Q17). Les tarifs sont configurables et
 * notés dans le journal avec leur base ; ils ne sont pas lus chez le fournisseur.
 */
import "server-only";

function price(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 && process.env[name] !== "" && process.env[name] !== undefined ? n : fallback;
}

/** Centimes d'euro par million de jetons. Défauts prudents, à confirmer sur la grille en vigueur. */
export const PRICES = {
  inputCentsPerMTok: price("LIMPID_PRICE_INPUT_CENTS_PER_MTOK", 50),
  outputCentsPerMTok: price("LIMPID_PRICE_OUTPUT_CENTS_PER_MTOK", 400),
};

export const PRICE_BASIS = `estimation ${PRICES.inputCentsPerMTok}/${PRICES.outputCentsPerMTok} c€ par Mjetons (configurable, non vérifiée)`;

export function estimateCents(inputTokens: number | null, outputTokens: number | null): number {
  const cents = ((inputTokens ?? 0) * PRICES.inputCentsPerMTok + (outputTokens ?? 0) * PRICES.outputCentsPerMTok) / 1e6;
  return Math.ceil(cents);
}

/** Taux de conversion USD → euro pour le journal (coût réel OpenRouter / Recraft). */
export const USD_TO_EUR = price("LIMPID_USD_TO_EUR", 0.92);

/** Centimes d'euro d'un appel : coût réel du fournisseur s'il est connu, sinon estimation par jetons. */
export function usageCents(u: { inputTokens: number | null; outputTokens: number | null; costUsd?: number | null }): number {
  if (typeof u.costUsd === "number" && Number.isFinite(u.costUsd) && u.costUsd >= 0) return Math.ceil(u.costUsd * 100 * USD_TO_EUR);
  return estimateCents(u.inputTokens, u.outputTokens);
}

/** Base de prix notée au journal pour un appel. */
export function priceBasisFor(u: { costUsd?: number | null }): string {
  return typeof u.costUsd === "number" ? `coût réel du fournisseur (USD × ${USD_TO_EUR})` : PRICE_BASIS;
}
