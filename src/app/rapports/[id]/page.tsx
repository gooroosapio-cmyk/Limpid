import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { DeleteReport } from "@/components/DeleteReport";
import { JobProgress } from "@/components/JobProgress";
import { composeLimpid } from "@/components/reader/v4/Pieces";
import { chapterQuizzes, LimpidScreen } from "@/components/reader/v4/LimpidScreen";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { readDisplayPrefs } from "@/lib/display/prefs";
import { getT } from "@/lib/i18n/server";
import { readerV3Enabled } from "@/lib/reader/flags";
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
  const [t, jar] = await Promise.all([getT(), cookies()]);
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
  const modeLabel = report.mode ? (t.add.modes[report.mode]?.title ?? null) : null;

  const status = (
    <>
      {!report.isCurrent && (
        <p className="notice" role="status">
          {t.versions.older} <Link href={`/rapports/${id}`}>{t.versions.backToCurrent}</Link>
        </p>
      )}
      {preparing && job && <JobProgress reportId={id} initial={job} compact partial={report.versions.length <= 1} />}
      {lastFailed && job && !preparing && report.isCurrent && (
        <div className="preparing">
          <p className="eyebrow">{t.versions.failedJob}</p>
          <JobProgress reportId={id} initial={job} compact />
        </div>
      )}
      {report.checkStatus !== "validated" && (
        <p className="notice notice-warn" role="status">{t.reader.incompleteCheck}</p>
      )}
      {report.notes.length > 0 && (
        <div className="notice notice-warn" role="status">
          <strong>{report.partial ? t.reader.partialCoverage : t.reader.aboutSource}</strong>
          <ul>{report.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}
    </>
  );

  const doc = composeLimpid({
    t,
    blueprint: report.blueprint,
    explanation: report.explanation,
    evidence: report.evidence,
    segments: report.segments,
    exercises: report.exercises,
    assets: report.assets,
    modeLabel,
    status,
    canReformulate: report.isCurrent && !preparing,
    documents: report.documentTitles,
  });

  return (
    <LimpidScreen
      doc={doc}
      readerV3={await readerV3Enabled()}
      quizzes={chapterQuizzes(report.explanation.sections)}
      reportId={report.isCurrent ? id : null}
      versionId={report.versionId}
      initialAnchor={report.progressAnchor}
      // Version courante : le bilan est noté par le serveur sur sa page ; aucune réponse n'est envoyée
      // au navigateur ici (liste vide = « un bilan existe »). Ancienne version : fenêtre locale.
      bilan={report.exercises?.bilan.length ? (report.isCurrent ? [] : report.exercises.bilan) : null}
      insufficient={report.exercises?.insufficient ?? false}
      annexBase={`/rapports/${id}/annexes${report.isCurrent ? "" : `?version=${report.shownVersion}`}`}
      originalHref={report.originalHref}
      options={{
        reportId: report.isCurrent ? id : null,
        title: report.title,
        pdfHref,
        hasExercises: !!report.exercises?.bilan.length,
        sourceTitle: report.sourceTitle,
        mode: report.mode,
        versions: report.versions.map((v) => ({
          href: v.current ? `/rapports/${id}` : `/rapports/${id}?version=${v.number}`,
          number: v.number,
          mode: v.mode,
          createdAt: v.createdAt,
          current: v.current,
          shown: v.number === report.shownVersion,
        })),
        offlineAccount: report.isCurrent ? offlineKey(user.id) : null,
        display: readDisplayPrefs((n) => jar.get(n)?.value),
      }}
    />
  );
}
