import type { Metadata } from "next";
import Link from "next/link";
import { DeleteAccount } from "@/components/DeleteAccount";
import { PreferencesQuiz } from "@/components/PreferencesQuiz";
import { ThemePicker } from "@/components/ThemePicker";
import { ThemeId } from "@/lib/contracts/schemas";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { fr } from "@/lib/i18n/fr";
import type { Answers } from "@/lib/preferences";
import { createUserClient } from "@/lib/supabase/server";
import { saveTheme } from "./actions";

export const metadata: Metadata = { title: fr.preferences.title };

export default async function PreferencesPage() {
  const user = await requireUser();
  const supabase = await createUserClient();
  const { data: p } = await supabase
    .from("reader_preferences")
    .select("goal, familiarity, aids, minutes, density, example_domain, theme_id")
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
      <ThemePicker initial={ThemeId.safeParse(p?.theme_id).data ?? "editorial"} target={{ preference: true }} onSave={saveTheme} />
      <section className="logout" aria-labelledby="account-h">
        <h2 id="account-h">{fr.account.title}</h2>
        <p className="muted">{user.email}</p>
        {(await isAdmin(user.id)) && (
          <p><Link href="/admin">{fr.admin.link}</Link></p>
        )}
        <p><Link href="/compte/mot-de-passe">{fr.login.setPassword}</Link></p>
        <form action="/auth/deconnexion" method="post">
          <button type="submit" className="btn btn-block">{fr.preferences.logout}</button>
        </form>
        <DeleteAccount />
      </section>
    </>
  );
}
