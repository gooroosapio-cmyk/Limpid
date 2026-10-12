import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DemoBanner } from "@/components/DemoBanner";
import { ImportForm } from "@/components/ImportForm";
import { Screen } from "@/components/shell/Screen";
import { Mode } from "@/lib/contracts/schemas";
import { requireUser } from "@/lib/auth";
import { isDemoMode, limits } from "@/lib/config";
import { getT } from "@/lib/i18n/server";
import { onboardingRedirect, onboardingState } from "@/lib/onboarding";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { loadLibrary } from "@/lib/library/load";
import { HomeSections } from "@/components/home/HomeSections";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.v4.homeTitle };
}

/** Prénom affiché : premier mot du nom choisi (jamais l'adresse email). */
function firstName(name: string | null): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first.slice(0, 40) : null;
}

const LIBRARY_PARAMS = ["vue", "q", "filtre", "dossier"];

/**
 * Accueil (kit V4) : « Bonjour », grande carte jaune qui est la zone de dépôt des fichiers
 * (approches et devis apparaissent une fois un document choisi), puis Reprendre et Récents.
 * Première connexion : questionnaire puis tutoriel avant d'arriver ici.
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
  const [{ data: profile, error }, { data: prefs }, library] = await Promise.all([
    supabase.from("profiles").select("onboarding_step, onboarding_done_at, tutorial_done_at, display_name").maybeSingle(),
    supabase.from("reader_preferences").select("default_mode").maybeSingle(),
    loadLibrary({ limit: 12 }),
  ]);
  // Lecture impossible : jamais de questionnaire imposé par erreur à un compte existant.
  const next = error ? null : onboardingRedirect(onboardingState(profile));
  if (next) redirect(next);
  const enabled = !isDemoMode() && isAdminConfigured();
  return (
    <Screen className="add-page home-v4">
      <h1 className="home-title">{t.home.hello(firstName((profile?.display_name as string | null) ?? null))}</h1>
      <p className="home-tagline">{t.home.tagline}</p>
      <DemoBanner />
      {!enabled && <p className="notice notice-warn">{t.create.notConfigured}</p>}
      <ImportForm
        enabled={enabled}
        maxFileMb={Math.round(limits.maxFileBytes / 1024 / 1024)}
        maxPages={limits.maxPages}
        defaultMode={Mode.safeParse(prefs?.default_mode).data ?? "auto"}
        folderId={/^[0-9a-f-]{36}$/i.test(sp.ranger ?? "") ? sp.ranger : null}
        hero
      />
      <HomeSections items={library.items} />
      <p className="muted small add-privacy">
        <span>{t.add.privacy}</span>{" "}
        <Link href="/compte/donnees">{t.add.privacyLink}</Link>
      </p>
    </Screen>
  );
}
