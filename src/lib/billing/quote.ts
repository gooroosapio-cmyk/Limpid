/**
 * Prix continu d'un cours (spécification du 14 octobre 2026, § 4 et § 5). Aucun palier : le
 * prix suit le contenu à traiter.
 *
 *   P = max(pages utiles non vides, ceil(jetons de contenu / 800))   (pages de contenu normalisées)
 *   crédits nominaux = 6 + ceil(P / 4) + 2 × R + 4 × H + 20 × G
 *   crédits confirmés = max(nominaux, ceil(coût prudent en FCFA / 3))
 *
 * R : pages imprimées à lire par OCR ou vision ; H : pages manuscrites (disjointes de R) ;
 * G : nouvelles images générées choisies. Le cours comprend son explication, ses questions,
 * un bilan, une carte mentale et une banque de flashcards initiales.
 *
 * Le coût prudent reprend les hypothèses de simulation (§ 12.1) avec 25 % de marge. Ce sont des
 * réglages de lancement à remplacer par les mesures réelles, pas des tarifs garantis.
 */

/** Jetons de contenu par page normalisée (convention à calibrer). */
export const TOKENS_PER_PAGE = 800;
/** Caractères par jeton pour l'estimation (texte français courant). */
export const CHARS_PER_TOKEN = 4;
/** Réserve interne de financement par crédit (FCFA) : règle de gestion, pas une valeur d'échange. */
export const XOF_PER_CREDIT = 3;
export const IMAGE_CREDITS = 20;

/** Hypothèses de coût (USD par million de jetons) et conversion de la simulation. */
export const COST_ASSUMPTIONS = {
  structure: { in: 0.15, out: 0.9 },
  luna: { in: 0.1, out: 0.5 },
  vision: { in: 0.75, out: 3.75 },
  imageUsd: 0.06,
  xofPerUsd: 650,
  margin: 0.25,
} as const;

export interface DocumentMeasure {
  /** Pages du PDF (scannées comprises) ; null pour un texte sans pagination. */
  pages: number | null;
  /** Caractères de texte natif extraits (hors pages encore à lire). */
  chars: number;
  /** Pages sans texte natif à lire par OCR (estimées avant lecture). */
  ocrPages: number;
}

/**
 * Pages de contenu normalisées d'un document (au moins 1) : ses pages, ou davantage si le texte
 * est dense ; une page scannée compte pour une page, son texte n'étant pas encore lu.
 */
export function contentPages(d: DocumentMeasure): number {
  const byTokens = Math.ceil(d.chars / CHARS_PER_TOKEN / TOKENS_PER_PAGE);
  return Math.max(1, d.pages ?? 0, byTokens + d.ocrPages);
}

export interface QuoteInput {
  /** Pages de contenu normalisées retenues pour le cours. */
  P: number;
  /** Pages imprimées à lire (OCR/vision). */
  R: number;
  /** Pages manuscrites à lire. */
  H: number;
  /** Nouvelles images générées. */
  G: number;
}

export function nominalCredits({ P, R, H, G }: QuoteInput): number {
  return 6 + Math.ceil(Math.max(1, P) / 4) + 2 * R + 4 * H + IMAGE_CREDITS * G;
}

/** Coût prudent simulé (FCFA, marge comprise) : structure, rédaction et supports, vision, images. */
export function prudentCostXof({ P, R, H, G }: QuoteInput): number {
  const a = COST_ASSUMPTIONS;
  const usd = (tokensIn: number, tokensOut: number, p: { in: number; out: number }) => (tokensIn * p.in + tokensOut * p.out) / 1e6;
  let total = usd(1_000 * P + 5_000, 200 * P + 1_000, a.structure) + usd(1_800 * P + 12_000, 700 * P + 4_000, a.luna);
  if (R + H > 0) total += usd(2_000 * R + 4_000 * H + 5_000, 1_000 * R + 2_000 * H + 1_000, a.vision);
  total += a.imageUsd * G;
  return total * a.xofPerUsd * (1 + a.margin);
}

export interface CourseQuote extends QuoteInput {
  nominal: number;
  credits: number;
  prudentXof: number;
}

export function quoteCourse(input: QuoteInput): CourseQuote {
  const nominal = nominalCredits(input);
  const prudentXof = prudentCostXof(input);
  return { ...input, nominal, prudentXof, credits: Math.max(nominal, Math.ceil(prudentXof / XOF_PER_CREDIT)) };
}

/**
 * Ajout d'un support (carte mentale ou flashcards) à un ancien Limpid qui ne l'incluait pas :
 * coût marginal depuis la base conservée, sans nouvelle lecture du document.
 */
export function supportAddonCredits(P: number): number {
  return 2 + Math.ceil(Math.max(1, P) / 20);
}
