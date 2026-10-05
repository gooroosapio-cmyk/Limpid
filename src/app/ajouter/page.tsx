import type { Metadata } from "next";
import { ImportForm } from "@/components/ImportForm";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { isDemoMode, isUrlImportEnabled, limits } from "@/lib/config";
import { fr } from "@/lib/i18n/fr";
import { isAdminConfigured } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: fr.add.title };

/** Ajouter un document (kit V3, écran 02) : import immédiat, aucun choix de pages ni de modèle. */
export default async function AddPage() {
  await requireUser();
  const enabled = !isDemoMode() && isAdminConfigured();
  return (
    <Screen title={fr.add.title} back="/">
      <h1>{fr.add.heading}</h1>
      <p className="lede">{fr.add.lede}</p>
      {!enabled && <p className="notice notice-warn">{fr.create.notConfigured}</p>}
      <ImportForm
        enabled={enabled}
        urlEnabled={isUrlImportEnabled()}
        maxFileMb={Math.round(limits.maxFileBytes / 1024 / 1024)}
        maxPages={limits.maxPages}
      />
    </Screen>
  );
}
