/**
 * Consignes des images générées (Recraft, Seedream via l'API Images d'OpenRouter) : jamais de
 * texte ni de chiffre inventé dans une illustration ; palette Limpid. Les appels eux-mêmes
 * passent par le fournisseur OpenRouter (une seule clé, coût réel relevé).
 */
import "server-only";

/** Consigne réaliste : une scène ou un objet concret, sans texte ni chiffre. */
export function realisticPrompt(subject: string, purpose: string, altText: string): string {
  return [
    `Editorial illustration with a natural, realistic look showing ${subject}, to help understand ${purpose}.`,
    `Only these validated elements: ${altText}.`,
    "Soft natural light, calm composition, muted ivory and green tones.",
    "No text, no letters, no numbers, no charts, no logos, no recognisable faces.",
  ].join(" ").slice(0, 1_000);
}

/** Consigne vectorielle : concept, sans texte, chiffres ni axes ; palette Limpid. */
export function vectorPrompt(subject: string, purpose: string, altText: string): string {
  return [
    `Flat vector editorial illustration of ${subject}, to show ${purpose}.`,
    `Only these validated elements: ${altText}.`,
    "Calm composition, generous negative space, soft ivory, ink green and warm yellow palette.",
    "No text, no letters, no numbers, no axes, no charts, no logos, no recognisable faces.",
  ].join(" ").slice(0, 1_000);
}
