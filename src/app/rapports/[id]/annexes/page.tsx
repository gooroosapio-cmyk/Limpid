import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AnnexesView } from "@/components/reader/AnnexesView";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { retention } from "@/lib/config";
import { getLang, getT } from "@/lib/i18n/server";
import { loadReport } from "@/lib/reports/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.lim.annexTitle };
}

const ANCHOR_RE = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * Annexes d'un Limpid (V5, § 14) : même rapport, même version, page continue hors du
 * carrousel. Lecture seule de ce qui est enregistré (contrôle du propriétaire par le
 * chargement du rapport) : ni génération ni OCR.
 */
export default async function AnnexesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string; from?: string }>;
}) {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const { id } = await params;
  const { version, from } = await searchParams;
  await requireUser();
  const wanted = version && /^\d{1,2}$/.test(version) ? Number(version) : undefined;
  const report = await loadReport(id, wanted);
  if (!report) notFound();
  if (report.state === "pending") redirect(`/rapports/${id}`);

  const back = new URLSearchParams();
  if (!report.isCurrent) back.set("version", String(report.shownVersion));
  if (from && ANCHOR_RE.test(from)) back.set("a", from);
  const qs = back.toString();
  const locale = lang === "en" ? "en-GB" : "fr-FR";

  return (
    <Screen footer={false} className="annex-screen">
      <AnnexesView
        t={t}
        title={report.title}
        backHref={`/rapports/${id}${qs ? `?${qs}` : ""}`}
        blueprint={report.blueprint}
        explanation={report.explanation}
        evidence={report.evidence}
        segments={report.segments}
        documents={report.documents}
        notes={report.notes}
        versionLabel={report.versions.length > 1 ? t.lim.annexVersion(report.shownVersion) : null}
        expiry={
          report.expiresAt
            ? t.reader.expires(
                report.expiresAt.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }),
                retention.reportDays,
              )
            : null
        }
      />
    </Screen>
  );
}
