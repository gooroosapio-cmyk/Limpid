/**
 * Lecture progressive d'une réponse JSON en cours d'écriture : valeur (partielle) d'une clé
 * texte, échappements JSON décodés, sans jamais couper une séquence d'échappement en deux.
 */
export function partialString(raw: string, key: string): string | null {
  const m = new RegExp(`"${key}"\\s*:\\s*"`).exec(raw);
  if (!m) return null;
  let out = "";
  for (let i = m.index + m[0].length; i < raw.length; i++) {
    const c = raw[i]!;
    if (c === '"') return out;
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = raw[i + 1];
    if (n === undefined) return out; // échappement incomplet : attendre la suite
    if (n === "u") {
      const hex = raw.slice(i + 2, i + 6);
      if (hex.length < 4) return out;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
      continue;
    }
    out += ({ n: "\n", t: "\t", r: "", b: "", f: "", '"': '"', "\\": "\\", "/": "/" } as Record<string, string>)[n] ?? n;
    i += 1;
  }
  return out;
}
