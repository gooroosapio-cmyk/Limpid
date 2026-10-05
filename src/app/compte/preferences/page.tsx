import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Icon } from "@/components/Icon";
import { ComfortSettings } from "@/components/account/DisplaySettings";
import { ReadingPrefs } from "@/components/account/ReadingPrefs";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { readDisplayPrefs } from "@/lib/display/prefs";
import { fr } from "@/lib/i18n/fr";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: fr.compte.rows.prefs![0] };

/** Préférences de lecture (kit V3, écran 30) : réglages directs à la place du questionnaire. */
export default async function ReadingPreferencesPage() {
  await requireUser();
  const supabase = await createUserClient();
  const [{ data: p }, jar] = await Promise.all([
    supabase.from("reader_preferences").select("familiarity, goal, example_domain").maybeSingle(),
    cookies(),
  ]);
  const display = readDisplayPrefs((n) => jar.get(n)?.value);
  return (
    <Screen title={fr.compte.rows.prefs![0]} back="/compte">
      <h1>{fr.compte.prefsHeading}</h1>
      <p className="lede">{fr.compte.prefsLede}</p>
      <ul className="rows">
        <li className="row row-static">
          <span className="row-icon"><Icon name="chat" /></span>
          <span className="row-text"><b>{fr.compte.language}</b><small>{fr.compte.languageValue}</small></span>
        </li>
      </ul>
      <ReadingPrefs familiarity={p?.familiarity ?? null} goal={p?.goal ?? null} concrete={p?.example_domain === "quotidien"} />
      <h2 className="eyebrow">{fr.compte.comfort}</h2>
      <ComfortSettings initial={display} />
      <div className="note">
        <b>{fr.compte.referenceTitle}</b>
        <p>{fr.compte.reference}</p>
      </div>
    </Screen>
  );
}
