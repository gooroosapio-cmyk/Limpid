import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeleteReport } from "@/components/DeleteReport";
import { JobProgress } from "@/components/JobProgress";
import { Reader } from "@/components/reader/Reader";
import { requireUser } from "@/lib/auth";
import { fr } from "@/lib/i18n/fr";
import { loadReport } from "@/lib/reports/load";

export const metadata: Metadata = { title: "Rapport" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const report = await loadReport(id);
  if (!report) notFound();

  if (report.state === "pending") {
    return (
      <>
        <h1>{report.title}</h1>
        <JobProgress reportId={id} initial={report.job} />
        <DeleteReport reportId={id} />
      </>
    );
  }

  return (
    <>
      {report.checkStatus !== "validated" && (
        <p className="notice notice-warn" role="status">
          {fr.reports.status.incomplete_check} : certaines vérifications n'ont pas abouti. Lisez ce rapport avec prudence.
        </p>
      )}
      {report.notes.length > 0 && (
        <div className="notice notice-warn" role="status">
          <p><strong>{fr.reader.partialCoverage}</strong></p>
          <ul>{report.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}
      <Reader
        blueprint={report.blueprint}
        explanation={report.explanation}
        evidence={report.evidence}
        segments={report.segments}
        sourceTitle={report.sourceTitle}
        sourceUrl={report.sourceUrl}
        pdfHref={`/api/reports/${id}/pdf`}
        isDemo={false}
      />
      <DeleteReport reportId={id} />
    </>
  );
}
