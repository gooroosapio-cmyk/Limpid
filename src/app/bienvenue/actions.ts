"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getLang } from "@/lib/i18n/server";
import { ONBOARDING_VERSION, STEPS, StepAnswer } from "@/lib/onboarding";
import { adminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

/** Avance l'étape atteinte (jamais en arrière : un retour ne fait pas perdre la reprise). */
async function reach(userId: string, step: number): Promise<boolean> {
  const db = adminClient();
  const { data } = await db.from("profiles").select("onboarding_step").eq("id", userId).maybeSingle();
  const next = Math.min(Math.max(step, data?.onboarding_step ?? 0), STEPS);
  return !(await db.from("profiles").update({ onboarding_step: next }).eq("id", userId)).error;
}

/** Enregistre la réponse d'une étape (préférences de lecture, ou attribution pour Q5). */
export async function saveOnboardingStep(input: unknown): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const parsed = StepAnswer.safeParse(input);
  if (!parsed.success) return { ok: false };
  const a = parsed.data;
  if (a.step === 5) {
    const { error } = await adminClient().from("profiles").update({ acquisition: a.value }).eq("id", user.id);
    if (error) return { ok: false };
  } else {
    const field =
      a.step === 1 ? { goal: a.value } : a.step === 2 ? { default_mode: a.value } : a.step === 3 ? { familiarity: a.value } : { doc_types: a.value };
    const supabase = await createUserClient();
    const { error } = await supabase.from("reader_preferences").upsert({ owner_id: user.id, ...field });
    if (error) return { ok: false };
  }
  return { ok: await reach(user.id, a.step) };
}

/** « Passer » : l'étape est franchie sans réponse (la préférence existante reste intacte). */
export async function skipOnboardingStep(step: unknown): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const parsed = z.number().int().min(1).max(STEPS).safeParse(step);
  if (!parsed.success) return { ok: false };
  return { ok: await reach(user.id, parsed.data) };
}

/**
 * Fin du questionnaire. Pour un compte qui n'avait encore rien réglé : exemples concrets
 * activés et langue des explications = langue de l'interface (les choix existants sont gardés).
 */
export async function finishOnboarding(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const supabase = await createUserClient();
  const { data: prefs } = await supabase.from("reader_preferences").select("aids, explanation_lang").maybeSingle();
  const fill: Record<string, unknown> = {};
  if (!prefs || (Array.isArray(prefs.aids) && prefs.aids.length === 0)) fill.aids = ["exemples"];
  if (!prefs?.explanation_lang) fill.explanation_lang = await getLang();
  if (Object.keys(fill).length) await supabase.from("reader_preferences").upsert({ owner_id: user.id, ...fill });
  const { error } = await adminClient()
    .from("profiles")
    .update({ onboarding_step: STEPS, onboarding_version: ONBOARDING_VERSION, onboarding_done_at: new Date().toISOString() })
    .eq("id", user.id);
  return { ok: !error };
}

/** Tutoriel terminé ou passé : il ne revient plus (rejouable depuis l'Aide). */
export async function finishTutorial(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const { error } = await adminClient().from("profiles").update({ tutorial_done_at: new Date().toISOString() }).eq("id", user.id);
  return { ok: !error };
}
