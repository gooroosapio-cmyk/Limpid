import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteReport } from "@/components/DeleteReport";
import { Icon } from "@/components/Icon";
import { JobProgress } from "@/components/JobProgress";
import { ThemePicker } from "@/components/ThemePicker";
import { Reader } from "@/components/reader/Reader";
import { OfflineSave } from "@/components/reader/OfflineSave";
import { ReportOptions } from "@/components/reader/ReportOptions";
import { VersionActions } from "@/components/reader/VersionActions";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { retention } from "@/lib/config";
import { fr } from "@/lib/i18n/fr";
import { LEVEL_LABELS } from "@/lib/labels";
import type { Level } from "@/lib/contracts/schemas";
import { offlineKey } from "@/lib/offline-key";
import { loadReport } from "@/lib/reports/load";

export const metadata: Metadata = { title: fr.reader.title };

const STAGES_FINAL = new Set(["verification", "illustrations", "mise_en_page"]);

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { id } = await params;
  const { version } = await searchParams;
  const user = await requireUser();
  const wanted = version && /^\d{1,2}$/.test(version) ? Number(version) : undefined;
  const report = await loadReport(id, wanted);
  if (!report) notFound();

  if (report.state === "pending") {
    const active = report.job.status === "queued" || report.job.status === "running";
    const title = !active ? report.title : STAGES_FINAL.has(report.job.stage ?? "") ? fr.prep.finalTitle : fr.prep.title;
    return (
      <Screen
        title={title}
        back="/"
        actions={active ? <Link href="/" className="ib" aria-label={fr.prep.close}><Icon name="close" /></Link> : undefined}
      >
        <JobProgress reportId={id} initial={report.job} />
        {!active && <DeleteReport reportId={id} />}
      </Screen>
    );
  }

  const job = report.latestJob;
  const preparing = !!job && (job.status === "queued" || job.status === "running");
  const lastFailed = !!job && (job.status === "failed" || job.status === "uncertain") && report.versions.length >= 1;
  const pdfHref = `/api/reports/${id}/pdf${report.isCurrent ? "" : `?version=${report.shownVersion}`}`;
  const themeName = fr.themes.names[report.theme] ?? report.theme;
  const themeLabel = report.themeChoice ? themeName : `${themeName} · ${fr.options.auto}`;

  return (
    <Screen
      title={fr.reader.title}
      back="/bibliotheque"
      actions={
        <ReportOptions
          reportId={id}
          pdfHref={pdfHref}
          originalHref={report.originalHref}
          sourceTitle={report.sourceTitle}
          themeLabel={themeLabel}
          themeControl={<ThemePicker initial={report.themeChoice} target={{ reportId: id }} />}
          offline={report.isCurrent ? <OfflineSave account={offlineKey(user.id)} path={`/rapports/${id}`} title={report.title} /> : undefined}
          versions={report.versions.map((v) => ({
            href: v.current ? `/rapports/${id}` : `/rapports/${id}?version=${v.number}`,
            label: `${v.number} · ${fr.versions.reasons[v.changeReason ?? ""] ?? LEVEL_LABELS[v.level as Level] ?? v.level}`,
            current: v.number === report.shownVersion,
          }))}
        />
      }
    >
      {!report.isCurrent && (
        <p className="notice" role="status">
          {fr.versions.older} <Link href={`/rapports/${id}`}>{fr.versions.backToCurrent}</Link>
        </p>
      )}
      {preparing && job && <JobProgress reportId={id} initial={job} compact />}
      {lastFailed && job && !preparing && report.isCurrent && (
        <div className="preparing">
          <p className="eyebrow">{fr.versions.failedJob}</p>
          <JobProgress reportId={id} initial={job} compact />
        </div>
      )}
      {report.checkStatus !== "validated" && (
        <p className="notice notice-warn" role="status">
          {fr.reports.status.incomplete_check} : certaines vérifications n'ont pas abouti. Lisez ce rapport avec prudence.
        </p>
      )}
      {report.notes.length > 0 && (
        <div className="notice notice-warn" role="status">
          <strong>{report.partial ? fr.reader.partialCoverage : fr.reader.aboutSource}</strong>
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
        originalHref={report.originalHref}
        isDemo={false}
        reportId={report.isCurrent ? id : null}
        answers={report.answers}
        actions={<VersionActions reportId={id} disabled={preparing || !report.isCurrent} />}
        actionsNote={report.isCurrent ? fr.reader.reportCost : null}
        theme={report.theme}
        assets={report.assets}
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
        footer={
          report.expiresAt ? (
            <p className="muted small reader-expiry">
              <Icon name="clock" size={16} />{" "}
              {fr.reader.expires(report.expiresAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }), retention.reportDays)}
            </p>
          ) : null
        }
      />
    </Screen>
  );
}
