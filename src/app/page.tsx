import Link from "next/link";
import { DemoBanner } from "@/components/DemoBanner";
import { ImportForm } from "@/components/ImportForm";
import { requireUser } from "@/lib/auth";
import { isDemoMode, isUrlImportEnabled } from "@/lib/config";
import { fr } from "@/lib/i18n/fr";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

export default async function CreatePage() {
  await requireUser();
  const supabase = await createUserClient();
  // Dernier rapport (maquette « Créer ») : lecture via RLS.
  const { data: last } = await supabase
    .from("reports")
    .select("id, title, created_at, jobs(status, created_at)")
    .eq("is_demo", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const job = [...((last?.jobs as { status: string; created_at: string }[] | null) ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const enabled = !isDemoMode() && isAdminConfigured();
  return (
    <>
      <h1>{fr.create.title}</h1>
      <p className="lead">{fr.create.subtitle}</p>
      <DemoBanner />
      {!enabled && !isDemoMode() && <p className="notice notice-warn">{fr.create.notConfigured}</p>}
      <ImportForm enabled={enabled} urlEnabled={isUrlImportEnabled()} />
      {last && (
        <section aria-labelledby="last-report" className="last-report">
          <h2 id="last-report">{fr.create.lastReport}</h2>
          <Link href={`/rapports/${last.id}`} className="card report-link">
            <span className="report-link-title">{last.title}</span>
            <span className="muted">
              {new Date(last.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              {job && ` · ${fr.reports.status[job.status] ?? job.status}`}
            </span>
          </Link>
        </section>
      )}
    </>
  );
}
