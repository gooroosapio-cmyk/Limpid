import type { AssetView } from "@/lib/render/visuals";

/** Crédit en texte (PDF) : auteur, licence et adresse, ou mention d'image générée. */
export function creditText(a: Pick<AssetView, "provider" | "author" | "license" | "licenseUrl" | "sourceUrl" | "modifications" | "model">): string {
  if (a.provider === "gemini" || a.provider === "recraft" || a.provider === "seedream" || a.provider === "openai") return `Illustration générée par IA${a.model ? ` (${a.model})` : ""}, sans valeur documentaire.`;
  const via = a.provider === "commons" ? "Wikimedia Commons" : "Unsplash";
  return [a.author, a.license && (a.licenseUrl ? `${a.license} (${a.licenseUrl})` : a.license), a.sourceUrl ? `${via} : ${a.sourceUrl}` : via, a.modifications]
    .filter(Boolean)
    .join(" · ");
}
