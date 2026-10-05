import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Cover } from "@/components/library/Cover";
import { LogoMark } from "@/components/Logo";
import { ReportLink } from "@/components/ReportLink";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { coverFor, coverView } from "@/lib/library/covers";
import { loadReport } from "@/lib/reports/load";
import { createUserClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.lesson.title };
}

const TABS = ["apercu", "sources", "supports"] as const;
type Tab = (typeof TABS)[number];

/**
 * Leçon (V2, écran 04) : couverture limitée en hauteur, titre et sources, onglets Aperçu /
 * Sources / Supports, l'essentiel et une idée à retenir, puis la présentation et le quiz.
 * « Demander à Limpid » s'ouvre à la demande (aucun coach proactif).
 */
export default async function LessonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ onglet?: string }> }) {
  const [t, { id }, { onglet }] = await Promise.all([getT(), params, searchParams]);
  await requireUser();
  const report = await loadReport(id);
  if (!report) notFound();
  if (report.state !== "ready") redirect(`/rapports/${id}`);
  const supabase = await createUserClient();
  const { data: extra } = await supabase.from("reports").select("cover_id").eq("id", id).maybeSingle();
  const cover = coverView(coverFor(id, (extra?.cover_id as string | null) ?? null));
  const tab: Tab = (TABS as readonly string[]).includes(onglet ?? "") ? (onglet as Tab) : "apercu";
  const l = t.lesson;
  const ex = report.explanation;
  const essential = ex.key_points?.length ? ex.key_points : ex.sections.slice(0, 3).map((s) => s.takeaway);
  const idea = ex.sections[0]?.takeaway ?? null;
  const hasQuiz = !!report.exercises?.bilan.length;
  const tabHref = (k: Tab) => (k === "apercu" ? `/rapports/${id}/apercu` : `/rapports/${id}/apercu?onglet=${k}`);

  return (
    <div className="lesson-page page-enter">
      <header className="lesson-hero">
        <Cover cover={cover} className="lesson-hero-cover" eager />
        <div className="lesson-hero-bar">
          <Link href="/" className="ib ib-round" aria-label={l.back}><Icon name="back" /></Link>
          <span className="brand lesson-hero-brand" aria-hidden="true"><LogoMark /><b>limpid</b></span>
          <Link href={`/rapports/${id}?ouvrir=options`} className="ib ib-round" aria-label={l.options}><Icon name="more" /></Link>
        </div>
        <div className="lesson-hero-text">
          <h1>{report.title}</h1>
          <p className="status status-ready">
            <Icon name="layers" /> <span>{t.library.v2.sources(report.documents.length || 1)}</span>
            <span aria-hidden="true">·</span> <span>{t.library.v2.ready}</span> <Icon name="check" />
          </p>
        </div>
      </header>

      <div className="lesson-body">
        <nav className="utabs" aria-label={l.tabsLabel}>
          {TABS.map((k) => (
            <Link key={k} href={tabHref(k)} aria-current={tab === k ? "page" : undefined} replace scroll={false}>{l.tabs[k]}</Link>
          ))}
        </nav>

        {tab === "apercu" && (
          <>
            <section aria-labelledby="essential-h">
              <h2 id="essential-h">{l.essential}</h2>
              {essential.length === 1 ? <p className="lesson-lede">{essential[0]}</p> : (
                <ul className="lesson-points">{essential.map((p) => <li key={p}>{p}</li>)}</ul>
              )}
            </section>
            {idea && (
              <aside className="lesson-idea" aria-label={l.idea}>
                <Icon name="bulb" size={28} />
                <div>
                  <p className="lesson-idea-eyebrow">{l.idea}</p>
                  <p className="lesson-idea-text">{idea}</p>
                </div>
              </aside>
            )}
            <section aria-labelledby="further-h">
              <h2 id="further-h">{l.further}</h2>
              <ul className="lesson-further">
                <li>
                  <ReportLink href={`/rapports/${id}`} className="further-card" immersive>
                    <Icon name="file" size={28} />
                    <b>{l.presentation[0]}</b>
                    <small>{l.presentation[1]}</small>
                    <span className="further-go" aria-hidden="true"><Icon name="arrow" /></span>
                  </ReportLink>
                </li>
                {hasQuiz && (
                  <li>
                    <ReportLink href={`/rapports/${id}?ouvrir=bilan`} className="further-card" immersive>
                      <Icon name="quiz" size={28} />
                      <b>{l.quiz[0]}</b>
                      <small>{l.quiz[1]}</small>
                      <span className="further-go" aria-hidden="true"><Icon name="arrow" /></span>
                    </ReportLink>
                  </li>
                )}
              </ul>
            </section>
          </>
        )}

        {tab === "sources" && (
          <section aria-labelledby="sources-h">
            <h2 id="sources-h" className="sr-only">{l.tabs.sources}</h2>
            <ul className="rows">
              {report.documents.map((d) => (
                <li key={d.sourceId}>
                  {d.originalHref ? (
                    <a href={d.originalHref} className="row" target="_blank" rel="noopener">
                      <span className="row-icon"><Icon name="file" /></span>
                      <span className="row-text"><b>{d.title}</b><small>{l.openOriginal}</small></span>
                      <Icon name="chevron" className="row-chevron" />
                    </a>
                  ) : (
                    <div className="row row-static">
                      <span className="row-icon"><Icon name="file" /></span>
                      <span className="row-text"><b>{d.title}</b><small>{l.originalGone}</small></span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="muted small">{l.sourcesNote}</p>
            <Link href="/ajouter" className="btn btn-block">{l.addSource}</Link>
          </section>
        )}

        {tab === "supports" && (
          <section aria-labelledby="supports-h">
            <h2 id="supports-h" className="sr-only">{l.tabs.supports}</h2>
            <ul className="rows">
              <li>
                <ReportLink href={`/rapports/${id}`} className="row" immersive>
                  <span className="row-icon"><Icon name="book" /></span>
                  <span className="row-text"><b>{l.presentation[0]}</b><small>{l.presentation[1]}</small></span>
                  <Icon name="chevron" className="row-chevron" />
                </ReportLink>
              </li>
              {hasQuiz && (
                <li>
                  <ReportLink href={`/rapports/${id}?ouvrir=bilan`} className="row" immersive>
                    <span className="row-icon"><Icon name="quiz" /></span>
                    <span className="row-text"><b>{l.quiz[0]}</b><small>{l.quiz[1]}</small></span>
                    <Icon name="chevron" className="row-chevron" />
                  </ReportLink>
                </li>
              )}
              <li>
                <Link href={`/rapports/${id}/annexes`} className="row">
                  <span className="row-icon"><Icon name="list" /></span>
                  <span className="row-text"><b>{l.annexes[0]}</b><small>{l.annexes[1]}</small></span>
                  <Icon name="chevron" className="row-chevron" />
                </Link>
              </li>
              <li>
                <a href={`/api/reports/${id}/pdf`} className="row">
                  <span className="row-icon"><Icon name="download" /></span>
                  <span className="row-text"><b>{l.pdf[0]}</b><small>{l.pdf[1]}</small></span>
                  <Icon name="chevron" className="row-chevron" />
                </a>
              </li>
            </ul>
          </section>
        )}
      </div>

      <div className="ask-bar">
        <ReportLink href={`/rapports/${id}?ouvrir=demander`} className="ask-bar-link" immersive>
          <Icon name="spark" />
          <span>{l.ask}</span>
          <span className="ask-bar-go" aria-hidden="true"><Icon name="arrow" /></span>
        </ReportLink>
      </div>
    </div>
  );
}
