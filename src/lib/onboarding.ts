/**
 * Première connexion (V4, § 10) : questionnaire en cinq étapes puis tutoriel en trois. L'état
 * est rangé dans le profil (étape atteinte, version, fin) ; les réponses vont dans les
 * préférences de lecture existantes, sauf l'attribution (Q5), rangée à part.
 */
import { z } from "zod";

export const ONBOARDING_VERSION = 1;
export const STEPS = 5;

export const GOAL_CHOICES = ["comprendre", "resumer", "reviser", "appliquer", "decider"] as const;
export const MODE_CHOICES = ["tres_simple", "claire", "resume", "revision"] as const;
export const FAMILIARITY_CHOICES = ["aucune", "bases", "maitrise"] as const;
export const DOC_CHOICES = ["cours", "pro", "livres", "administratif", "autre"] as const;
export const ACQUISITION_CHOICES = ["recherche", "reseaux", "proche", "ecole", "autre", "sans_reponse"] as const;

/** Réponse d'une étape (1 à 5). Q4 : trois documents au maximum. */
export const StepAnswer = z.discriminatedUnion("step", [
  z.strictObject({ step: z.literal(1), value: z.enum(GOAL_CHOICES) }),
  z.strictObject({ step: z.literal(2), value: z.enum(MODE_CHOICES) }),
  z.strictObject({ step: z.literal(3), value: z.enum(FAMILIARITY_CHOICES) }),
  z.strictObject({ step: z.literal(4), value: z.array(z.enum(DOC_CHOICES)).min(1).max(3) }),
  z.strictObject({ step: z.literal(5), value: z.enum(ACQUISITION_CHOICES) }),
]);
export type StepAnswer = z.infer<typeof StepAnswer>;

export interface OnboardingState {
  /** Étape à afficher (1 à 5 ; la dernière tant que le questionnaire n'est pas validé), 6 une fois fini. */
  step: number;
  done: boolean;
  tutorialDone: boolean;
}

/** État lu dans le profil : un profil absent ou incomplet est traité comme un nouveau compte. */
export function onboardingState(row: { onboarding_step?: number | null; onboarding_done_at?: string | null; tutorial_done_at?: string | null } | null): OnboardingState {
  const done = !!row?.onboarding_done_at;
  const reached = Math.min(Math.max(row?.onboarding_step ?? 0, 0), STEPS);
  return { step: done ? STEPS + 1 : Math.min(reached + 1, STEPS), done, tutorialDone: !!row?.tutorial_done_at };
}

/** Où envoyer l'utilisateur qui arrive sur l'Accueil : questionnaire, tutoriel ou rien. */
export function onboardingRedirect(state: OnboardingState): string | null {
  if (!state.done) return "/bienvenue";
  if (!state.tutorialDone) return "/bienvenue/tutoriel";
  return null;
}
