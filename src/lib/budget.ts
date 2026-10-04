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
