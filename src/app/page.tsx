import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DemoBanner } from "@/components/DemoBanner";
import { ImportForm } from "@/components/ImportForm";
import { Screen } from "@/components/shell/Screen";
import { Mode } from "@/lib/contracts/schemas";
import { requireUser } from "@/lib/auth";
import { isDemoMode, isUrlImportEnabled, limits } from "@/lib/config";
import { getT } from "@/lib/i18n/server";
import { onboardingRedirect, onboardingState } from "@/lib/onboarding";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.v4.homeTitle };
}

const TABS = { fichier: "file", lien: "link", texte: "text" } as const;
const LIBRARY_PARAMS = ["vue", "q", "filtre", "dossier"];

/**
 * Accueil = écran d'import (écran par défaut) : Fichier / Lien / Texte et leurs contraintes
 * réelles, quatre approches, niveau et longueur dans une feuille locale, coût estimé par le
 * serveur. Première connexion : questionnaire puis tutoriel avant d'arriver ici.
 */
export default async function HomeImportPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  // Anciennes adresses de la bibliothèque (/?filtre=…, /?vue=…) : redirigées, paramètres conservés.
  if (LIBRARY_PARAMS.some((k) => k in sp)) {
    const qs = new URLSearchParams(Object.entries(sp).filter(([k]) => LIBRARY_PARAMS.includes(k))).toString();
    redirect(`/bibliotheque?${qs}`);
  }
  await requireUser();
  const t = await getT();
  const supabase = await createUserClient();
  const [{ data: profile, error }, { data: prefs }] = await Promise.all([
    supabase.from("profiles").select("onboarding_step, onboarding_done_at, tutorial_done_at").maybeSingle(),
    supabase.from("reader_preferences").select("default_mode").maybeSingle(),
  ]);
  // Lecture impossible : jamais de questionnaire imposé par erreur à un compte existant.
  const next = error ? null : onboardingRedirect(onboardingState(profile));
  if (next) redirect(next);
  const enabled = !isDemoMode() && isAdminConfigured();
  const tab = TABS[sp.mode as keyof typeof TABS] ?? "file";
  return (
    <Screen className="add-page">
      <h1>{t.v4.homeTitle}</h1>
      <DemoBanner />
      {!enabled && <p className="notice notice-warn">{t.create.notConfigured}</p>}
      <ImportForm
        key={tab}
        initialTab={tab}
        enabled={enabled}
        urlEnabled={isUrlImportEnabled()}
        maxFileMb={Math.round(limits.maxFileBytes / 1024 / 1024)}
        maxPages={limits.maxPages}
        defaultMode={Mode.safeParse(prefs?.default_mode).data ?? "auto"}
      />
      <p className="muted small add-privacy">
        <span>{t.add.privacy}</span>{" "}
        <Link href="/compte/donnees">{t.add.privacyLink}</Link>
      </p>
    </Screen>
  );
}
