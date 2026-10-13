/**
 * Rappels des flashcards (§ 8) : règle déterministe, versionnée, configurable, sans appel IA.
 * Réglage de départ : 1, 3, 7, 14 puis 30 jours après « Acquis » ; « Difficile » ralentit ;
 * « À revoir » remet la carte un peu plus loin dans la session puis la rappelle le lendemain.
 * Ce calendrier est un réglage produit, pas une garantie d'apprentissage.
 */
export const SCHEDULE_VERSION = 1;
export const STEPS_DAYS = [1, 3, 7, 14, 30] as const;
export const MAX_INTERVAL_DAYS = 365;
/** « À revoir » : la carte revient après ce nombre d'autres cartes dans la session. */
export const REQUEUE_GAP = 3;
/** Passages au plus d'une même carte dans une session. */
export const MAX_PASSES = 3;

export const RATINGS = ["again", "hard", "good"] as const;
export type Rating = (typeof RATINGS)[number];

export interface CardState {
  step: number;
  interval_days: number;
  reviews: number;
  lapses: number;
  last_rating: Rating | null;
  next_review_at: string | null;
}

export const NEW_CARD: CardState = { step: 0, interval_days: 0, reviews: 0, lapses: 0, last_rating: null, next_review_at: null };

/** Intervalle (jours) du palier `k` : 1, 3, 7, 14, 30 puis doublement, borné. */
export function intervalFor(k: number): number {
  if (k < STEPS_DAYS.length) return STEPS_DAYS[Math.max(0, k)]!;
  return Math.min(MAX_INTERVAL_DAYS, STEPS_DAYS[STEPS_DAYS.length - 1]! * 2 ** (k - STEPS_DAYS.length + 1));
}

const DAY = 24 * 3600 * 1000;

/** Nouvel état après une note (horodatage UTC). */
export function applyRating(state: CardState, rating: Rating, at: Date): CardState {
  let step = state.step;
  let interval: number;
  let lapses = state.lapses;
  if (rating === "again") {
    step = 0;
    interval = 1;
    lapses += state.reviews > 0 ? 1 : 0;
  } else if (rating === "hard") {
    // Même palier, intervalle du palier précédent : la progression ralentit sans repartir à zéro.
    interval = intervalFor(Math.max(0, step - 1));
  } else {
    interval = intervalFor(step);
    step = Math.min(step + 1, 20);
  }
  return {
    step,
    interval_days: interval,
    reviews: state.reviews + 1,
    lapses,
    last_rating: rating,
    next_review_at: new Date(at.getTime() + interval * DAY).toISOString(),
  };
}

/**
 * État recalculé à partir des événements effectifs (non remplacés), dans l'ordre : une note
 * corrigée juste après coup donne le même résultat que si elle avait été choisie d'emblée.
 */
export function replay(events: { rating: Rating; occurred_at: string }[]): CardState {
  return [...events]
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at))
    .reduce((s, e) => applyRating(s, e.rating, new Date(e.occurred_at)), NEW_CARD);
}

/**
 * Fin du jour local de l'apprenant (minuit suivant dans son fuseau), en UTC. `offsetMinutes` :
 * décalage du fuseau tel que donné par `Date#getTimezoneOffset()` côté appareil.
 */
export function endOfLocalDay(now: Date, offsetMinutes: number): Date {
  const local = new Date(now.getTime() - offsetMinutes * 60_000);
  const end = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1);
  return new Date(end + offsetMinutes * 60_000);
}

/** Carte à revoir aujourd'hui (jour local) : jamais vue ou rappel échu avant la fin du jour. */
export function isDue(state: Pick<CardState, "next_review_at"> | undefined, now: Date, offsetMinutes = 0): boolean {
  if (!state?.next_review_at) return true;
  return Date.parse(state.next_review_at) < endOfLocalDay(now, offsetMinutes).getTime();
}

/**
 * Place d'une carte notée « À revoir » dans la file de la session : quelques cartes plus loin,
 * si elle n'a pas déjà atteint son nombre de passages. Renvoie la file mise à jour.
 */
export function requeue(queue: string[], position: number, cardId: string): { queue: string[]; requeued: boolean } {
  const passes = queue.filter((id) => id === cardId).length;
  if (passes >= MAX_PASSES) return { queue, requeued: false };
  const at = Math.min(queue.length, position + 1 + REQUEUE_GAP);
  // Aucune autre carte pour différer la répétition : pas de boucle immédiate.
  if (at === position + 1 && queue.length === position + 1) return { queue, requeued: false };
  return { queue: [...queue.slice(0, at), cardId, ...queue.slice(at)], requeued: true };
}
