import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LinkRow } from "@/components/LinkRow";
import { ComfortSettings, ModeSettings } from "@/components/account/DisplaySettings";
import { InterfaceLanguage, ResetPreferences } from "@/components/account/InterfaceSettings";
import { ReadingPrefs } from "@/components/account/ReadingPrefs";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { readDisplayPrefs } from "@/lib/display/prefs";
import { getT } from "@/lib/i18n/server";
import { createUserClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.nav.settings };
}

/** Paramètres (V4, § 14) : interface, explications, confort de lecture, apparence, à propos. */
export default async function SettingsPage() {
  const t = await getT();
  await requireUser();
  const supabase = await createUserClient();
  const [{ data: p }, jar] = await Promise.all([
    supabase.from("reader_preferences").select("familiarity, goal, example_domain, default_mode, explanation_lang").maybeSingle(),
    cookies(),
  ]);
  const display = readDisplayPrefs((n) => jar.get(n)?.value);
  return (
    <Screen footer>
      <h1>{t.nav.settings}</h1>
      <p className="lede">{t.compte.prefsLede}</p>

      <section aria-labelledby="set-ui" className="settings-block">
        <h2 id="set-ui" className="eyebrow">{t.compte.interfaceHeading}</h2>
        <InterfaceLanguage />
      </section>

      <section aria-labelledby="set-reading" className="settings-block">
        <h2 id="set-reading" className="eyebrow">{t.compte.explanationsHeading}</h2>
        <p className="muted small">{t.compte.explanationsLede}</p>
        <ReadingPrefs
          familiarity={p?.familiarity ?? null}
          goal={p?.goal ?? null}
          concrete={p?.example_domain === "quotidien"}
          defaultMode={p?.default_mode ?? null}
          explanationLang={p?.explanation_lang ?? null}
        />
      </section>

      <section aria-labelledby="set-comfort" className="settings-block">
        <h2 id="set-comfort" className="eyebrow">{t.compte.comfort}</h2>
        <ComfortSettings initial={display} />
      </section>

      <section aria-labelledby="set-look" className="settings-block">
        <h2 id="set-look" className="eyebrow">{t.compte.appearanceHeading}</h2>
        <p className="muted small">{t.compte.appearanceLede}</p>
        <ModeSettings initial={display.mode} />
      </section>

      <div className="note">
        <b>{t.compte.referenceTitle}</b>
        <p>{t.compte.reference}</p>
      </div>
      <ResetPreferences />

      <section aria-labelledby="set-app" className="settings-block">
        <h2 id="set-app" className="eyebrow">{t.compte.aboutHeading}</h2>
        <ul className="rows">
          <LinkRow href="/a-propos" icon="info" title={t.compte.about[0]} sub={t.compte.about[1]} />
          <LinkRow href="/compte/installer" icon="download" title={t.compte.rows.install![0]} sub={t.compte.rows.install![1]} />
          <LinkRow href="/compte/donnees" icon="shield" title={t.compte.rows.data![0]} sub={t.compte.rows.data![1]} />
        </ul>
      </section>
    </Screen>
  );
}
