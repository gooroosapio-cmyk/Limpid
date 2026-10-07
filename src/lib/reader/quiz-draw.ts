/** Tirage local d'un lot de questions de chapitre (aucun appel IA). */

export interface Drawable {
  id: string;
  choices: string[];
  correct_index: number;
  explanations: string[];
}

/** Lot présenté : 2 questions, 3 quand la banque est riche (6 et plus), jamais plus que la banque. */
export function lotSize(poolSize: number): number {
  if (poolSize <= 0) return 0;
  return Math.min(poolSize, poolSize >= 6 ? 3 : 2);
}

function shuffle<T>(list: T[], rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Nouveau lot pour une visite : évite les questions du lot précédent tant que la banque le
 * permet, puis complète au hasard. Les choix sont mélangés en gardant la bonne réponse et
 * l'explication de chaque choix (la position ne donne jamais la réponse).
 */
export function drawLot<Q extends Drawable>(pool: Q[], previous: string[], rand: () => number = Math.random): Q[] {
  const size = lotSize(pool.length);
  const before = new Set(previous);
  const fresh = shuffle(pool.filter((q) => !before.has(q.id)), rand);
  const seen = shuffle(pool.filter((q) => before.has(q.id)), rand);
  return [...fresh, ...seen].slice(0, size).map((q) => {
    const order = shuffle(q.choices.map((_, i) => i), rand);
    return {
      ...q,
      choices: order.map((i) => q.choices[i]!),
      explanations: order.map((i) => q.explanations[i] ?? ""),
      correct_index: order.indexOf(q.correct_index),
    };
  });
}
