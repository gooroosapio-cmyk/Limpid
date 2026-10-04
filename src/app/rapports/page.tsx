import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { demoBlueprint, demoExplanation } from "@/lib/demo/cycle-eau";
import { LEVEL_LABELS } from "@/lib/labels";
import { fr } from "@/lib/i18n/fr";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: fr.reports.title };

export default async function ReportsPage() {
  await requireUser();
  const supabase = await createUserClient();
  const { data: reports } = await supabase
    .from("reports")
    .select("id, title, created_at, jobs(status, created_at)")
    .eq("is_demo", false)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <h1>{fr.reports.title}</h1>

      <section aria-labelledby="mes-docs">
        <h2 id="mes-docs">{fr.reports.privateTitle}</h2>
        {!reports?.length ? (
          <p className="muted">{fr.reports.empty}</p>
        ) : (
          <ul className="report-list">
            {reports.map((r) => {
              const job = [...(r.jobs ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
              return (
                <li key={r.id} className="report-item">
                  <Link href={`/rapports/${r.id}`} className="card">
                    {job && <span className="badge">{fr.reports.status[job.status] ?? job.status}</span>}
                    <h3>{r.title}</h3>
                    <span className="muted">
                      {new Date(r.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="demos">
        <h2 id="demos">{fr.reports.demos}</h2>
        <ul className="report-list">
          <li className="report-item">
            <Link href="/rapports/demo" className="card">
              <span className="badge badge-demo">{fr.demo.badge}</span>
              <h3>{demoBlueprint.title}</h3>
              <span className="muted">
                {LEVEL_LABELS[demoExplanation.level]} · {demoExplanation.sections.length} sections
              </span>
            </Link>
          </li>
        </ul>
      </section>
    </>
  );
}
