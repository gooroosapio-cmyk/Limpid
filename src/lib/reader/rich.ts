/**
 * Mise en forme légère d'un texte du modèle : **gras** et *italique* seulement, rendus en
 * éléments React (aucun HTML injecté). Les marques non fermées restent du texte.
 */
export interface RichRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export function parseRich(text: string): RichRun[] {
  const runs: RichRun[] = [];
  // Une marque colle au mot qu'elle entoure (« 5 * 3 » n'est pas de l'italique).
  const re = /\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*|\*(?=\S)([^*\n]+?)(?<=\S)\*/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    if (m.index > last) runs.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) runs.push({ text: m[1], bold: true });
    else runs.push({ text: m[2]!, italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs.filter((r) => r.text.length > 0);
}

/** Texte sans marques (comptage, alternatives textuelles, PDF). */
export function stripRich(text: string): string {
  return parseRich(text)
    .map((r) => r.text)
    .join("");
}

/**
 * Découpe un long paragraphe en paragraphes plus courts, aux fins de phrase, pour que la
 * composition des vues remplisse l'écran sans couper de phrase. Une marque de mise en forme
 * à cheval sur une coupure annule le découpage (le texte reste entier).
 */
export function splitParagraph(text: string, target = 220): string[] {
  if (text.length <= target * 1.4) return [text];
  const sentences = text.split(/(?<=[.!?…»])\s+(?=[«"A-ZÀ-ÖØ-Þ0-9])/u);
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && cur.length + s.length + 1 > target) {
      out.push(cur);
      cur = s;
    } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) {
    // Pas de dernier paragraphe orphelin trop court : il rejoint le précédent.
    if (out.length && cur.length < target / 3) out[out.length - 1] = `${out[out.length - 1]} ${cur}`;
    else out.push(cur);
  }
  const marks = (p: string) => p.match(/\*\*|\*/g) ?? [];
  const balanced = out.every((p) => {
    const m = marks(p);
    return m.filter((x) => x === "**").length % 2 === 0 && m.filter((x) => x === "*").length % 2 === 0;
  });
  return balanced && out.length > 1 ? out : [text];
}
