import type { Metadata } from "next";
import Link from "next/link";
import { DemoBanner } from "@/components/DemoBanner";
import { ImportForm } from "@/components/ImportForm";
import { Screen } from "@/components/shell/Screen";
import { Mode } from "@/lib/contracts/schemas";
import { requireUser } from "@/lib/auth";
import { isDemoMode, isUrlImportEnabled, limits } from "@/lib/config";
import { getT } from "@/lib/i18n/server";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.v4.add.title };
}

const TABS = { fichier: "file", lien: "link", texte: "text" } as const;

/**
 * Créer un Limpid (V4, § 6) : Fichier / Lien / Texte et leurs contraintes réelles, quatre
 * approches, niveau et longueur dans une feuille locale, coût estimé par le serveur.
 */
export default async function AddPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  await requireUser();
  const t = await getT();
  const { mode } = await searchParams;
  const supabase = await createUserClient();
  const { data: prefs } = await supabase.from("reader_preferences").select("default_mode").maybeSingle();
  const enabled = !isDemoMode() && isAdminConfigured();
  const tab = TABS[mode as keyof typeof TABS] ?? "file";
  return (
    <Screen className="add-page">
      <h1>{t.v4.add.title}</h1>
      <DemoBanner />
      {!enabled && <p className="notice notice-warn">{t.create.notConfigured}</p>}
      <ImportForm
        key={tab}
        initialTab={tab}
        enabled={enabled}
        urlEnabled={isUrlImportEnabled()}
        maxFileMb={Math.round(limits.maxFileBytes / 1024 / 1024)}
        maxPages={limits.maxPages}
        defaultMode={Mode.safeParse(prefs?.default_mode).data ?? "claire"}
      />
      <p className="muted small add-privacy">
        <span>{t.add.privacy}</span>{" "}
        <Link href="/compte/donnees">{t.add.privacyLink}</Link>
      </p>
      <div className="add-foot">
        <Link href="/bibliotheque" className="btn btn-block">{t.add.seeMine}</Link>
      </div>
    </Screen>
  );
}
