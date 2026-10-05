/**
 * Repère, dans un texte, la première occurrence de chaque notion du glossaire (mot entier,
 * sans tenir compte de la casse). Le rendu reste du texte : aucune insertion de HTML.
 */
export type TermPiece = string | { term: string; text: string };

export function termMatcher(terms: string[]): RegExp | null {
  const clean = [...new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 2 && t.length <= 60))].sort((a, b) => b.length - a.length);
  if (clean.length === 0) return null;
  const escaped = clean.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join("|")})(?![\\p{L}\\p{N}])`, "giu");
}

/** `used` : notions déjà soulignées dans le rapport (une seule fois chacune, lecture calme). */
export function splitTerms(text: string, matcher: RegExp | null, terms: string[], used: Set<string>): TermPiece[] {
  if (!matcher) return [text];
  const byKey = new Map(terms.map((t) => [t.trim().toLowerCase(), t.trim()]));
  const out: TermPiece[] = [];
  let last = 0;
  for (const m of text.matchAll(matcher)) {
    const key = m[0].toLowerCase();
    const term = byKey.get(key);
    if (!term || used.has(key) || m.index === undefined) continue;
    used.add(key);
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ term, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
