/**
 * Localisation des citations : le modèle ne fournit jamais d'offsets.
 * Il cite un extrait ; le serveur le retrouve dans le segment figé et calcule
 * les offsets exacts. La citation stockée est toujours la tranche réelle du source.
 */

/** Variantes typographiques ramenées à une forme unique pour la recherche. */
const FOLD: Record<string, string> = {
  "’": "'", "‘": "'", "ʼ": "'", "`": "'",
  "“": '"', "”": '"', "«": '"', "»": '"',
  "–": "-", "—": "-", "‑": "-",
  "…": "...",
};

/** Texte replié + table de correspondance vers les positions d'origine. */
function fold(text: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  let lastWasSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        folded += " ";
        map.push(i);
      }
      lastWasSpace = true;
      continue;
    }
    lastWasSpace = false;
    const rep = (FOLD[ch] ?? ch).toLowerCase();
    for (const c of rep) {
      folded += c;
      map.push(i);
    }
  }
  return { folded, map };
}

export interface LocatedQuote {
  start: number;
  end: number;
  quote: string;
}

/** Retrouve `quote` dans `text` (exact, puis tolérant à la typographie, la casse et les espaces). */
export function locateQuote(text: string, quote: string): LocatedQuote | null {
  const q = quote.trim().replace(/^["«“]\s*|\s*["»”]$/g, "").replace(/(\.\.\.|…)$/, "").trim();
  if (q.length < 3) return null;

  const exact = text.indexOf(q);
  if (exact >= 0) return { start: exact, end: exact + q.length, quote: q };

  const t = fold(text);
  const fq = fold(q).folded.trim();
  const at = t.folded.indexOf(fq);
  if (at < 0) return null;
  const start = t.map[at]!;
  const lastOrig = t.map[at + fq.length - 1]!;
  const end = lastOrig + 1;
  return { start, end, quote: text.slice(start, end) };
}
