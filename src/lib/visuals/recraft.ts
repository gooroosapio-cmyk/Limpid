/**
 * Consignes des images générées (Nano Banana 2.1, secours GPT Image 2, via OpenRouter) : jamais
 * de texte ni de chiffre inventé dans une illustration ; palette Limpid. Le fond des dessins est
 * imposé à part (magenta à détourer, voir cutout.ts).
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
    "Calm composition, generous negative space, ink green, dark ink and warm yellow palette, clean outlines.",
    "No text, no letters, no numbers, no axes, no charts, no logos, no recognisable faces.",
  ].join(" ").slice(0, 1_000);
}
