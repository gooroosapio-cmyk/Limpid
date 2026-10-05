import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ResetPreferences } from "@/components/account/InterfaceSettings";
import { ReadingPrefs } from "@/components/account/ReadingPrefs";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { createUserClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.compte.prefsEntry[0] };
}

/**
 * Préférences (V5, § 9) : les réglages pédagogiques réunis derrière une seule entrée de
 * Paramètres. Facultatives, modifiables, réinitialisables ; elles valent pour les prochains
 * Limpid et ne réécrivent pas l'historique.
 */
export default async function PreferencesPage() {
  const t = await getT();
  await requireUser();
  const supabase = await createUserClient();
  const { data: p } = await supabase
    .from("reader_preferences")
    .select("familiarity, goal, example_domain, default_mode, explanation_lang")
    .maybeSingle();
  return (
    <Screen footer>
      <p className="crumbs">
        <Link href="/parametres"><Icon name="back" size={16} /> {t.nav.settings}</Link>
      </p>
      <h1>{t.compte.prefsEntry[0]}</h1>
      <p className="lede">{t.compte.prefsEntry[1]}</p>
      <p className="muted small">{t.compte.explanationsLede}</p>
      <ReadingPrefs
        familiarity={p?.familiarity ?? null}
        goal={p?.goal ?? null}
        concrete={p?.example_domain === "quotidien"}
        defaultMode={p?.default_mode ?? null}
        explanationLang={p?.explanation_lang ?? null}
      />
      <div className="note">
        <b>{t.compte.referenceTitle}</b>
        <p>{t.compte.reference}</p>
      </div>
      <ResetPreferences />
    </Screen>
  );
}
