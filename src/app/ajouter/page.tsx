import type { Metadata } from "next";
import Link from "next/link";
import { DemoBanner } from "@/components/DemoBanner";
import { ImportForm } from "@/components/ImportForm";
import { Screen } from "@/components/shell/Screen";
import { Mode } from "@/lib/contracts/schemas";
import { requireUser } from "@/lib/auth";
import { isDemoMode, isUrlImportEnabled, limits, retention } from "@/lib/config";
import { getT } from "@/lib/i18n/server";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.add.title };
}

const TABS = { fichier: "file", lien: "link", texte: "text" } as const;

/**
 * Nouveau Limpid (V4, § 15) : titre court, Fichier / Lien / Texte, quatre approches,
 * « Créer mon Limpid », puis « Voir mes Limpid » et « Propulsé par gooroo ».
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
      <h1>{t.add.heading}</h1>
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
        <span>{t.add.privacy(Math.round(retention.originalHours / 24), retention.reportDays)}</span>{" "}
        <Link href="/compte/donnees">{t.add.privacyLink}</Link>
      </p>
      <div className="add-foot">
        <Link href="/" className="btn btn-block">{t.add.seeMine}</Link>
      </div>
    </Screen>
  );
}
