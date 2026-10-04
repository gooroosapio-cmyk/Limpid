import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteReport } from "@/components/DeleteReport";
import { JobProgress } from "@/components/JobProgress";
import { ThemePicker } from "@/components/ThemePicker";
import { Reader } from "@/components/reader/Reader";
import { VersionActions } from "@/components/reader/VersionActions";
import { requireUser } from "@/lib/auth";
import { fr } from "@/lib/i18n/fr";
import { LEVEL_LABELS } from "@/lib/labels";
import type { Level } from "@/lib/contracts/schemas";
import { loadReport } from "@/lib/reports/load";

export const metadata: Metadata = { title: "Rapport" };

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { id } = await params;
  const { version } = await searchParams;
  await requireUser();
  const wanted = version && /^\d{1,2}$/.test(version) ? Number(version) : undefined;
  const report = await loadReport(id, wanted);
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

  const job = report.latestJob;
  const preparing = !!job && (job.status === "queued" || job.status === "running");
  const lastFailed = !!job && (job.status === "failed" || job.status === "uncertain") && report.versions.length >= 1;
  const pdfHref = `/api/reports/${id}/pdf${report.isCurrent ? "" : `?version=${report.shownVersion}`}`;

  return (
    <>
      {report.versions.length > 1 && (
        <nav className="versions" aria-label={fr.versions.label}>
          <span className="muted">{fr.versions.label} :</span>
          {report.versions.map((v) => (
            <Link
              key={v.number}
              href={v.current ? `/rapports/${id}` : `/rapports/${id}?version=${v.number}`}
              className="chip"
              aria-current={v.number === report.shownVersion ? "page" : undefined}
            >
              {v.number} · {fr.versions.reasons[v.changeReason ?? ""] ?? LEVEL_LABELS[v.level as Level] ?? v.level}
            </Link>
          ))}
        </nav>
      )}
      {!report.isCurrent && (
        <p className="notice" role="status">
          {fr.versions.older} <Link href={`/rapports/${id}`}>{fr.versions.backToCurrent}</Link>
        </p>
      )}
      {preparing && job && (
        <div className="preparing">
          <p className="eyebrow">{fr.versions.preparing}</p>
          <JobProgress reportId={id} initial={job} />
        </div>
      )}
      {lastFailed && job && !preparing && report.isCurrent && (
        <div className="preparing">
          <p className="eyebrow">{fr.versions.failedJob}</p>
          <JobProgress reportId={id} initial={job} />
        </div>
      )}
      {report.checkStatus !== "validated" && (
        <p className="notice notice-warn" role="status">
          {fr.reports.status.incomplete_check} : certaines vérifications n'ont pas abouti. Lisez ce rapport avec prudence.
        </p>
      )}
      {report.notes.length > 0 && (
        <div className="notice notice-warn" role="status">
          <p><strong>{report.partial ? fr.reader.partialCoverage : fr.reader.aboutSource}</strong></p>
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
        pdfHref={pdfHref}
        isDemo={false}
        reportId={report.isCurrent ? id : null}
        answers={report.answers}
        actions={<VersionActions reportId={id} disabled={preparing || !report.isCurrent} />}
        actionsNote={report.isCurrent ? fr.reader.reportCost : null}
        theme={report.theme}
        assets={report.assets}
        themeControl={<ThemePicker initial={report.theme} target={{ reportId: id }} />}
        sectionActions={
          report.isCurrent && !preparing
            ? (sectionId) => (
                <>
                  <VersionActions reportId={id} disabled={false} sectionId={sectionId} />
                  <p className="muted small section-cost">{fr.reader.sectionCost}</p>
                </>
              )
            : undefined
        }
      />
      <DeleteReport reportId={id} />
    </>
  );
}
