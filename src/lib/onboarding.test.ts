import { describe, expect, it } from "vitest";
import { onboardingRedirect, onboardingState, StepAnswer } from "./onboarding";

describe("première connexion", () => {
  it("un nouveau compte commence à l'étape 1", () => {
    const s = onboardingState({ onboarding_step: 0, onboarding_done_at: null, tutorial_done_at: null });
    expect(s).toEqual({ step: 1, done: false, tutorialDone: false });
    expect(onboardingRedirect(s)).toBe("/bienvenue");
  });

  it("reprend à l'étape quittée", () => {
    expect(onboardingState({ onboarding_step: 3 }).step).toBe(4);
    expect(onboardingState({ onboarding_step: 99 }).step).toBe(5);
  });

  it("un profil absent est traité comme un nouveau compte", () => {
    expect(onboardingRedirect(onboardingState(null))).toBe("/bienvenue");
  });

  it("questionnaire fini : tutoriel, puis plus rien", () => {
    expect(onboardingRedirect(onboardingState({ onboarding_step: 5, onboarding_done_at: "2026-10-06", tutorial_done_at: null }))).toBe("/bienvenue/tutoriel");
    expect(onboardingRedirect(onboardingState({ onboarding_step: 5, onboarding_done_at: "2026-10-06", tutorial_done_at: "2026-10-06" }))).toBeNull();
  });

  it("valide les réponses de chaque étape", () => {
    expect(StepAnswer.safeParse({ step: 1, value: "resumer" }).success).toBe(true);
    expect(StepAnswer.safeParse({ step: 2, value: "claire" }).success).toBe(true);
    expect(StepAnswer.safeParse({ step: 3, value: "expert" }).success).toBe(false);
    expect(StepAnswer.safeParse({ step: 4, value: ["cours", "pro", "livres"] }).success).toBe(true);
    expect(StepAnswer.safeParse({ step: 4, value: ["cours", "pro", "livres", "autre"] }).success).toBe(false);
    expect(StepAnswer.safeParse({ step: 4, value: [] }).success).toBe(false);
    expect(StepAnswer.safeParse({ step: 5, value: "sans_reponse" }).success).toBe(true);
    expect(StepAnswer.safeParse({ step: 6, value: "x" }).success).toBe(false);
  });
});
