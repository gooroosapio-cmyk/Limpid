/**
 * Coupure des libellés d'un schéma SVG (V5) : le SVG ne coupe pas le texte de lui-même. La
 * largeur de chaque caractère est estimée (em) ; un libellé trop large passe sur plusieurs
 * lignes, puis à une taille plus petite si un mot seul dépasse, et n'est jamais tronqué.
 */
function charEm(c: string): number {
  if (c === " ") return 0.28;
  if (/[iljtfrI.,;:'!|()\[\]]/.test(c)) return 0.3;
  if (/[mwMW@]/.test(c)) return 0.86;
  if (/[A-Z]/.test(c)) return 0.68;
  if (/[0-9]/.test(c)) return 0.58;
  return 0.55;
}

export function textEm(s: string): number {
  let w = 0;
  for (const c of s) w += charEm(c);
  return w;
}

/** Coupe `text` en lignes de largeur ≤ `maxEm` ; un mot plus long est scindé avec un trait d'union. */
export function wrapEm(text: string, maxEm: number): string[] {
  const lines: string[] = [];
  let line = "";
  const push = (word: string) => {
    const candidate = line ? `${line} ${word}` : word;
    if (textEm(candidate) <= maxEm) {
      line = candidate;
      return;
    }
    if (line) lines.push(line);
    line = "";
    // Mot seul trop large : scindé.
    let rest = word;
    while (textEm(rest) > maxEm) {
      let k = 1;
      while (k < rest.length && textEm(`${rest.slice(0, k + 1)}-`) <= maxEm) k++;
      lines.push(`${rest.slice(0, k)}-`);
      rest = rest.slice(k);
    }
    line = rest;
  };
  for (const word of text.trim().split(/\s+/)) if (word) push(word);
  if (line) lines.push(line);
  return lines;
}

/**
 * Libellé dans une boîte de `widthPx` : taille de police choisie parmi `sizes` (la plus grande
 * qui tient en `maxLines` lignes sans couper de mot), lignes calculées.
 */
export function fitLabel(text: string, widthPx: number, sizes = [17, 15, 13], maxLines = 3): { size: number; lines: string[] } {
  for (const size of sizes) {
    const maxEm = widthPx / size;
    const words = text.trim().split(/\s+/);
    if (words.some((w) => textEm(w) > maxEm)) continue;
    const lines = wrapEm(text, maxEm);
    if (lines.length <= maxLines) return { size, lines };
  }
  const size = sizes[sizes.length - 1]!;
  return { size, lines: wrapEm(text, widthPx / size) };
}
