import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Questionnaire } from "@/components/onboarding/Questionnaire";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { onboardingState } from "@/lib/onboarding";
import { createUserClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.v4.onboarding.brand };
}

/**
 * Questionnaire de première connexion (V4, § 10) : une question par écran, reprise à l'étape
 * quittée. « ?revoir=1 » (Profil > Mon apprentissage) le rouvre avec les réponses actuelles.
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ revoir?: string }> }) {
  await requireUser();
  const { revoir } = await searchParams;
  const supabase = await createUserClient();
  const [{ data: profile }, { data: prefs }] = await Promise.all([
    supabase.from("profiles").select("onboarding_step, onboarding_done_at, tutorial_done_at, acquisition").maybeSingle(),
    supabase.from("reader_preferences").select("goal, default_mode, familiarity, doc_types").maybeSingle(),
  ]);
  const state = onboardingState(profile);
  const review = revoir === "1";
  if (state.done && !review) redirect(state.tutorialDone ? "/" : "/bienvenue/tutoriel");
  return (
    <div className="page onboarding-page">
      <Questionnaire
        initialStep={review ? 1 : state.step}
        review={review}
        initial={{
          goal: prefs?.goal ?? null,
          mode: prefs?.default_mode ?? null,
          familiarity: prefs?.familiarity ?? null,
          docs: Array.isArray(prefs?.doc_types) ? (prefs.doc_types as string[]) : [],
          acquisition: profile?.acquisition ?? null,
        }}
      />
    </div>
  );
}
