/**
 * Fonds façon post-it (§ 9) : cinq clés de couleur, attribuées une fois à la création par un
 * tirage pseudoaléatoire équilibré (graine stable), puis conservées dans le support. Le rendu ne
 * tire jamais de couleur ; la couleur n'exprime ni difficulté ni statut.
 */
export const COLOR_KEYS = ["jaune", "peche", "menthe", "bleu", "lavande"] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export function isColorKey(v: unknown): v is ColorKey {
  return typeof v === "string" && (COLOR_KEYS as readonly string[]).includes(v);
}

/** Hachage FNV-1a 32 bits (stable, sans dépendance serveur). */
export function fnv1a(text: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Générateur déterministe (mulberry32) à partir d'une graine texte. */
export function seededRandom(seedText: string): () => number {
  let a = fnv1a(seedText);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Couleurs équilibrées pour `n` objets : chaque couleur revient autant de fois (à une près),
 * dans un ordre mélangé par la graine, sans deux voisins identiques quand c'est possible.
 * `keep` : couleurs déjà attribuées (identité conservée d'une version à l'autre).
 */
export function assignColors(ids: string[], seed: string, keep: Map<string, ColorKey> = new Map()): Map<string, ColorKey> {
  const rand = seededRandom(seed);
  const out = new Map<string, ColorKey>();
  const counts = new Map<ColorKey, number>(COLOR_KEYS.map((c) => [c, 0]));
  for (const id of ids) {
    const k = keep.get(id);
    if (k) {
      out.set(id, k);
      counts.set(k, counts.get(k)! + 1);
    }
  }
  let prev: ColorKey | null = null;
  for (const id of ids) {
    if (out.has(id)) {
      prev = out.get(id)!;
      continue;
    }
    const min = Math.min(...counts.values());
    let pool = COLOR_KEYS.filter((c) => counts.get(c) === min && c !== prev);
    if (!pool.length) pool = COLOR_KEYS.filter((c) => c !== prev);
    const pick = pool[Math.floor(rand() * pool.length)]!;
    out.set(id, pick);
    counts.set(pick, counts.get(pick)! + 1);
    prev = pick;
  }
  return out;
}
