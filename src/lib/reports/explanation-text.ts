/** Texte d'une explication (parties, blocs, glossaire) transmis au modèle comme donnée. */
import type { ExplanationObject } from "@/lib/contracts/schemas";

type Section = ExplanationObject["sections"][number];

export function sectionText(s: Section): string {
  const lines = [`## [${s.id}] ${s.question}`, `À retenir : ${s.takeaway}`];
  for (const b of s.blocks) {
    if (b.type === "definition") lines.push(`Définition — ${b.term} : ${b.text}`);
    else if (b.type === "analogy") lines.push(`Analogie : ${b.text} (limite : ${b.limit})`);
    else if (b.type === "fictional_example") lines.push(`Exemple imaginé : ${b.text}`);
    else if (b.type === "caution") lines.push(`Prudence : ${b.text}`);
    else lines.push(b.text);
  }
  return lines.join("\n");
}

export function explanationText(e: ExplanationObject, sectionIds?: string[], maxChars = 40_000): string {
  const parts = e.sections.filter((s) => !sectionIds || sectionIds.includes(s.id)).map(sectionText);
  if (!sectionIds && e.glossary.length) parts.push(`## Glossaire\n${e.glossary.map((g) => `${g.term} : ${g.definition}`).join("\n")}`);
  const text = parts.join("\n\n");
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}
