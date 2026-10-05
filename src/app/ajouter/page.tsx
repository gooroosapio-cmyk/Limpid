import type { Metadata } from "next";
import { DemoBanner } from "@/components/DemoBanner";
import { ImportForm } from "@/components/ImportForm";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { isDemoMode, isUrlImportEnabled, limits } from "@/lib/config";
import { getT } from "@/lib/i18n/server";
import { isAdminConfigured } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.nav.home };
}

const TABS = { fichier: "file", lien: "link", texte: "text" } as const;

/**
 * Accueil : ajouter un document à expliquer (kit V3, écran 02). Import immédiat, aucun choix
 * de pages ni de modèle. `?mode=texte|fichier|lien` ouvre directement le bon onglet (menu).
 */
export default async function AddPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const t = await getT();
  await requireUser();
  const { mode } = await searchParams;
  const tab = TABS[mode as keyof typeof TABS] ?? "file";
  const enabled = !isDemoMode() && isAdminConfigured();
  return (
    <Screen className="hero">
      <div className="stagger">
        <span className="eyebrow">{t.home.eyebrow}</span>
        <h1>{t.home.title}</h1>
        <p className="lede">{t.add.lede}</p>
        <DemoBanner />
        {!enabled && <p className="notice notice-warn">{t.create.notConfigured}</p>}
      </div>
      <ImportForm
        key={tab}
        initialTab={tab}
        enabled={enabled}
        urlEnabled={isUrlImportEnabled()}
        maxFileMb={Math.round(limits.maxFileBytes / 1024 / 1024)}
        maxPages={limits.maxPages}
      />
    </Screen>
  );
}
