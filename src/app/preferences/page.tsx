import type { Metadata } from "next";
import { PreferencesQuiz } from "@/components/PreferencesQuiz";
import { requireUser } from "@/lib/auth";
import { fr } from "@/lib/i18n/fr";
import type { Answers } from "@/lib/preferences";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: fr.preferences.title };

export default async function PreferencesPage() {
  const user = await requireUser();
  const supabase = await createUserClient();
  const { data: p } = await supabase
    .from("reader_preferences")
    .select("goal, familiarity, aids, minutes, density, example_domain")
    .maybeSingle();
  const initial: Answers | null = p
    ? {
        goal: p.goal ? [p.goal] : [],
        familiarity: p.familiarity ? [p.familiarity] : [],
        aids: p.aids ?? [],
        minutes: p.minutes ? [String(p.minutes)] : [],
        density: p.density ? [p.density] : [],
        example_domain: p.example_domain ? [p.example_domain] : [],
      }
    : null;
  return (
    <>
      <h1>{fr.preferences.title}</h1>
      <p className="muted">{fr.preferences.intro}</p>
      <PreferencesQuiz initial={initial} />
      <form action="/auth/deconnexion" method="post" className="logout">
        <p className="muted">{user.email}</p>
        <button type="submit" className="btn btn-block">{fr.preferences.logout}</button>
      </form>
    </>
  );
}
