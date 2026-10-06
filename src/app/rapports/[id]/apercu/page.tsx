import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Cover } from "@/components/library/Cover";
import { Wordmark } from "@/components/Logo";
import { Illustration } from "@/components/Illustration";
import { ReportLink } from "@/components/ReportLink";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { lessonCover } from "@/lib/library/covers";
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
  const { data: extra } = await supabase.from("reports").select("cover_id, cover_path").eq("id", id).maybeSingle();
  const cover = lessonCover(id, (extra?.cover_id as string | null) ?? null, (extra?.cover_path as string | null) ?? null);
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
          <Link href="/" className="ib lesson-bar-btn" aria-label={l.back}><Icon name="back" size={26} /></Link>
          <span className="brand lesson-hero-brand" aria-hidden="true"><Wordmark /></span>
          <Link href={`/rapports/${id}?ouvrir=options`} className="ib lesson-bar-btn" aria-label={l.options}><Icon name="more" size={26} /></Link>
        </div>
        <div className="lesson-hero-text">
          <h1>{report.title}</h1>
          <p className="lesson-meta">
            <Icon name="layers" /> <span>{t.library.v2.sources(report.documents.length || 1)}</span>
            <span aria-hidden="true">·</span> <span>{t.library.v2.ready.toLowerCase()}</span>
            <span className="lesson-ok" aria-hidden="true"><Icon name="check" size={16} /></span>
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
              <p className="lesson-lede">{essential.join(" ")}</p>
            </section>
            {idea && (
              <aside className="lesson-idea" aria-label={l.idea}>
                <Icon name="bulb" size={40} />
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
                    <Illustration name="lecon-presentation" fallback="papier" className="further-bg" />
                    <Icon name="file" size={34} />
                    <b>{l.presentation[0]}</b>
                    <small>{l.presentation[1]}</small>
                    <span className="further-go" aria-hidden="true"><Icon name="arrow" /></span>
                  </ReportLink>
                </li>
                {hasQuiz && (
                  <li>
                    <ReportLink href={`/rapports/${id}?ouvrir=bilan`} className="further-card further-quiz" immersive>
                      <Illustration name="lecon-quiz" fallback="mineral" className="further-bg" />
                      <Icon name="quiz" size={34} />
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

      {/* Demander à Limpid : la question ouvre le volet de discussion du lecteur, pré-remplie (rien n'est envoyé sans geste). */}
      <form className="ask-bar" action={`/rapports/${id}`} method="get" role="search">
        <input type="hidden" name="ouvrir" value="demander" />
        <Icon name="spark" />
        <span className="ask-bar-sep" aria-hidden="true" />
        <label htmlFor="ask-q" className="sr-only">{l.ask}</label>
        <input id="ask-q" name="q" type="text" placeholder={l.ask} maxLength={500} autoComplete="off" enterKeyHint="send" />
        <button type="submit" className="ask-bar-go" aria-label={l.askSend}><Icon name="send" /></button>
      </form>
    </div>
  );
}
