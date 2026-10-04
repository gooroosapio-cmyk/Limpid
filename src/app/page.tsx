import { DemoBanner } from "@/components/DemoBanner";
import { ImportForm } from "@/components/ImportForm";
import { requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import type { Level } from "@/lib/contracts/schemas";
import { fr } from "@/lib/i18n/fr";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

const LEVEL_BY_FAMILIARITY: Record<string, Level> = { aucune: "grand_public", bases: "grand_public", maitrise: "etudiant" };

export default async function CreatePage() {
  await requireUser();
  const supabase = await createUserClient();
  const { data: prefs } = await supabase.from("reader_preferences").select("familiarity").maybeSingle();
  const enabled = !isDemoMode() && isAdminConfigured();
  return (
    <>
      <h1>{fr.create.title}</h1>
      <p className="muted">{fr.create.subtitle}</p>
      <DemoBanner />
      {!enabled && !isDemoMode() && <p className="notice notice-warn">{fr.create.notConfigured}</p>}
      <ImportForm enabled={enabled} defaultLevel={LEVEL_BY_FAMILIARITY[prefs?.familiarity ?? ""] ?? "grand_public"} />
    </>
  );
}
