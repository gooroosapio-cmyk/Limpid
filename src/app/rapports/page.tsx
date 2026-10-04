import Link from "next/link";
import type { Metadata } from "next";
import { demoBlueprint, demoExplanation } from "@/lib/demo/cycle-eau";
import { LEVEL_LABELS } from "@/lib/labels";
import { fr } from "@/lib/i18n/fr";

export const metadata: Metadata = { title: fr.reports.title };

export default function ReportsPage() {
  return (
    <>
      <h1>{fr.reports.title}</h1>

      <section aria-labelledby="mes-docs">
        <h2 id="mes-docs">{fr.reports.privateTitle}</h2>
        <p className="muted">{fr.reports.empty}</p>
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
