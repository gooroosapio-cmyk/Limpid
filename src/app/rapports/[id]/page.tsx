import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteReport } from "@/components/DeleteReport";
import { Icon } from "@/components/Icon";
import { Immersive } from "@/components/reader/Immersive";
import { JobProgress } from "@/components/JobProgress";
import { ThemePicker } from "@/components/ThemePicker";
import { Reader } from "@/components/reader/Reader";
import { OfflineSave } from "@/components/reader/OfflineSave";
import { ReportOptions } from "@/components/reader/ReportOptions";
import { VersionActions } from "@/components/reader/VersionActions";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { retention } from "@/lib/config";
import { getT } from "@/lib/i18n/server";
import { LEVEL_LABELS } from "@/lib/labels";
import type { Level } from "@/lib/contracts/schemas";
import { offlineKey } from "@/lib/offline-key";
import { loadReport } from "@/lib/reports/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.reader.title };
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const t = await getT();
  const { id } = await params;
  const { version } = await searchParams;
  const user = await requireUser();
  const wanted = version && /^\d{1,2}$/.test(version) ? Number(version) : undefined;
  const report = await loadReport(id, wanted);
  if (!report) notFound();

  if (report.state === "pending") {
    const active = report.job.status === "queued" || report.job.status === "running";
    return (
      <Screen>
        <JobProgress reportId={id} initial={report.job} />
        {!active && <DeleteReport reportId={id} />}
      </Screen>
    );
  }

  const job = report.latestJob;
  const preparing = !!job && (job.status === "queued" || job.status === "running");
  const lastFailed = !!job && (job.status === "failed" || job.status === "uncertain") && report.versions.length >= 1;
  const pdfHref = `/api/reports/${id}/pdf${report.isCurrent ? "" : `?version=${report.shownVersion}`}`;
  const themeName = t.themes.names[report.theme] ?? report.theme;
  const themeLabel = report.themeChoice ? themeName : `${themeName} · ${t.options.auto}`;

  return (
    <Immersive>
      <div className="page page-reader">
      {!report.isCurrent && (
        <p className="notice" role="status">
          {t.versions.older} <Link href={`/rapports/${id}`}>{t.versions.backToCurrent}</Link>
        </p>
      )}
      {preparing && job && <JobProgress reportId={id} initial={job} compact />}
      {lastFailed && job && !preparing && report.isCurrent && (
        <div className="preparing">
          <p className="eyebrow">{t.versions.failedJob}</p>
          <JobProgress reportId={id} initial={job} compact />
        </div>
      )}
      {report.checkStatus !== "validated" && (
        <p className="notice notice-warn" role="status">
          {t.reports.status.incomplete_check} : certaines vérifications n'ont pas abouti. Lisez ce rapport avec prudence.
        </p>
      )}
      {report.notes.length > 0 && (
        <div className="notice notice-warn" role="status">
          <strong>{report.partial ? t.reader.partialCoverage : t.reader.aboutSource}</strong>
          <ul>{report.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}
      <Reader
        t={t}
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
        actionsNote={report.isCurrent ? t.reader.reportCost : null}
        theme={report.theme}
        assets={report.assets}
        sectionActions={
          report.isCurrent && !preparing
            ? (sectionId) => (
                <>
                  <VersionActions reportId={id} disabled={false} sectionId={sectionId} />
                  <p className="muted small section-cost">{t.reader.sectionCost}</p>
                </>
              )
            : undefined
        }
        options={
          <ReportOptions
            reportId={id}
            pdfHref={pdfHref}
            originalHref={report.originalHref}
            sourceTitle={report.sourceTitle}
            themeLabel={themeLabel}
            themeControl={<ThemePicker initial={report.themeChoice} target={{ reportId: id }} />}
            versions={report.versions.map((v) => ({
              href: v.current ? `/rapports/${id}` : `/rapports/${id}?version=${v.number}`,
              label: `${v.number} · ${t.versions.reasons[v.changeReason ?? ""] ?? LEVEL_LABELS[v.level as Level] ?? v.level}`,
              current: v.number === report.shownVersion,
            }))}
            offline={report.isCurrent ? <OfflineSave account={offlineKey(user.id)} path={`/rapports/${id}`} title={report.title} /> : undefined}
          />
        }
        footer={
          report.expiresAt ? (
            <p className="muted small reader-expiry">
              <Icon name="clock" size={16} />{" "}
              {t.reader.expires(report.expiresAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }), retention.reportDays)}
            </p>
          ) : null
        }
      />
      </div>
    </Immersive>
  );
}
