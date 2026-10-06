/**
 * Adresse publique du site (liens envoyés par e-mail, retours de paiement, en-têtes des
 * fournisseurs). LIMPID_SITE_URL fait foi ; en production, défaut = domaine officiel.
 * Jamais l'en-tête Host : un lien envoyé ne doit pas pouvoir être détourné.
 */
export const OFFICIAL_SITE_URL = "https://limpid.company";

export function siteUrl(env: NodeJS.ProcessEnv = process.env): string {
  const declared = env.LIMPID_SITE_URL?.trim();
  return (declared && /^https?:\/\/[^\s/]+/.test(declared) ? declared : OFFICIAL_SITE_URL).replace(/\/$/, "");
}
