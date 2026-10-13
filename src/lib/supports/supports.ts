/**
 * Supports d'apprentissage (prompt « Supports et révisions », § 1 et § 3) : quatre formats
 * sélectionnables ensemble, une seule préparation commune. Le livre et le parcours sont deux
 * consultations du même texte (aucun coût en plus) ; la carte mentale et les flashcards sont des
 * productions dérivées de la base commune, facturées à leur coût marginal.
 */
import { z } from "zod";
import { ACTION_PRICES, supportAction, type ReportAction, type SupportAction } from "@/lib/billing/catalog";

export const SUPPORTS = ["livre", "parcours", "carte", "flashcards"] as const;
export type Support = (typeof SUPPORTS)[number];
export const Support = z.enum(SUPPORTS);
/** Supports produits par une unité de génération propre (dérivés de la base commune). */
export const DERIVED_SUPPORTS = ["carte", "flashcards"] as const;
export type DerivedSupport = (typeof DERIVED_SUPPORTS)[number];
export const DerivedSupport = z.enum(DERIVED_SUPPORTS);

export const SupportSelection = z
  .array(Support)
  .min(1)
  .max(SUPPORTS.length)
  .transform((list) => SUPPORTS.filter((s) => list.includes(s)));

/** Sélection proposée à une nouvelle création : le livre interactif. */
export const DEFAULT_SUPPORTS: Support[] = ["livre"];

export function isDerived(s: Support): s is DerivedSupport {
  return (DERIVED_SUPPORTS as readonly string[]).includes(s);
}

/** Lecture tolérante d'une liste enregistrée (anciens Limpid : le livre). */
export function readSupports(v: unknown): Support[] {
  const list = Array.isArray(v) ? v.filter((x): x is Support => (SUPPORTS as readonly string[]).includes(x as string)) : [];
  return list.length ? SUPPORTS.filter((s) => list.includes(s)) : [...DEFAULT_SUPPORTS];
}

/**
 * Approche interne de rédaction : l'adaptation au document est la règle (« auto ») ; un parcours
 * demandé seul garde l'écriture par étapes. Les anciennes approches restent comprises.
 */
export function modeForSupports(supports: Support[]): "auto" | "parcours" {
  return supports.includes("parcours") && !supports.includes("livre") ? "parcours" : "auto";
}

/** Ancien envoi (approche seule) : supports équivalents. */
export function supportsForMode(mode: string | null | undefined): Support[] {
  return mode === "parcours" ? ["parcours"] : ["livre"];
}

export interface SupportQuote {
  /** Préparation commune (lecture, base pédagogique, explications). */
  base: { action: ReportAction; credits: number };
  /** Coût marginal de chaque support dérivé demandé. */
  extras: { support: DerivedSupport; action: SupportAction; credits: number }[];
  total: number;
}

/** Devis : préparation commune + coût marginal des supports dérivés (une seule lecture du document). */
export function quoteSupports(action: ReportAction, supports: Support[]): SupportQuote {
  const extra = supportAction(action);
  const extras = supports.filter(isDerived).map((support) => ({ support, action: extra, credits: ACTION_PRICES[extra] }));
  const base = { action, credits: ACTION_PRICES[action] };
  return { base, extras, total: base.credits + extras.reduce((n, e) => n + e.credits, 0) };
}
