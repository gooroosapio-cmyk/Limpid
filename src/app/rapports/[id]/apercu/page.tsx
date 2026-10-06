import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Cover } from "@/components/library/Cover";
import { ChatFab } from "@/components/reader/ChatFab";
import { PdfLink } from "@/components/reader/PdfLink";
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

/** Une idée à retenir distincte de l'essentiel : la première conclusion de section qui n'y figure pas. */
function pickIdea(takeaways: string[], essential: string[]): string | null {
  const norm = (x: string) => x.trim().toLowerCase();
  const used = new Set(essential.map(norm));
  const first = essential.join(" ").trim().toLowerCase().slice(0, 60);
  return takeaways.find((x) => x && !used.has(norm(x)) && !first.startsWith(norm(x).slice(0, 60))) ?? null;
}

/**
 * Aperçu d'un Limpid (V4, § 8) : en-tête, onglets, zone centrale qui défile (l'essentiel, une
 * idée à retenir, notions clés), dock toujours visible (Présentation, QCM) et bouton de
 * discussion flottant. Ouvert en tête à chaque visite (nouvelle zone de défilement).
 */
export default async function LessonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ onglet?: string }> }) {
  const [t, { id }, { onglet }] = await Promise.all([getT(), params, searchParams]);
  await requireUser();
  const report = await loadReport(id);
  if (!report) notFound();
  if (report.state !== "ready") redirect(`/rapports/${id}`);
  const supabase = await createUserClient();
  const { data: extra } = await supabase.from("reports").select("cover_id, cover_path, cover_url, cover_credit").eq("id", id).maybeSingle();
  const cover = lessonCover(id, (extra?.cover_id as string | null) ?? null, (extra?.cover_path as string | null) ?? null, {
    url: extra?.cover_url as string | null,
    credit: extra?.cover_credit,
  });
  const tab: Tab = (TABS as readonly string[]).includes(onglet ?? "") ? (onglet as Tab) : "apercu";
  const l = t.lesson;
  const p = t.v4.preview;
  const ex = report.explanation;
  const essential = ex.key_points?.length ? ex.key_points : ex.sections.slice(0, 3).map((s) => s.takeaway);
  const idea = pickIdea(ex.sections.map((s) => s.takeaway), essential);
  const notions = ex.glossary.slice(0, 6);
  const hasQuiz = !!report.exercises?.bilan.length;
  const tabHref = (k: Tab) => (k === "apercu" ? `/rapports/${id}/apercu` : `/rapports/${id}/apercu?onglet=${k}`);

  return (
    <div className="preview-shell lesson-page">
      <header className="preview-head">
        <Link href="/bibliotheque" className="icon-button" aria-label={l.back}><Icon name="back" size={22} /></Link>
        <h1 className="preview-title">{report.title}</h1>
        <Link href={`/rapports/${id}?ouvrir=options`} className="icon-button" aria-label={l.options}><Icon name="more" size={22} /></Link>
      </header>
      <nav className="utabs preview-tabs" aria-label={l.tabsLabel}>
        {TABS.map((k) => (
          <Link key={k} href={tabHref(k)} aria-current={tab === k ? "page" : undefined} replace scroll={false}>{l.tabs[k]}</Link>
        ))}
      </nav>

      <div className="preview-scroll">
        {tab === "apercu" && (
          <>
            <Cover cover={cover} className="preview-cover" eager />
            {cover.credit?.author && (
              <p className="cover-credit">
                {cover.credit.source === "pixabay" ? t.v4.preview.illustrationBy : t.v4.preview.photoBy}{" "}
                <a href={cover.credit.source === "pixabay" ? cover.credit.url : `${cover.credit.url}?utm_source=limpid&utm_medium=referral`} target="_blank" rel="noopener noreferrer">{cover.credit.author}</a>
              </p>
            )}
            <p className="meta preview-meta">
              <Icon name="check" size={14} /> {t.library.v2.ready} · {t.library.v2.sources(report.documents.length || 1)}
            </p>
            <section className="preview-card" aria-labelledby="essential-h">
              <h2 id="essential-h">{l.essential}</h2>
              <p>{essential.join(" ")}</p>
            </section>
            {idea && (
              <aside className="preview-idea" aria-labelledby="idea-h">
                <span className="preview-idea-icon" aria-hidden="true"><Icon name="bulb" size={20} /></span>
                <div>
                  <h2 id="idea-h">{l.idea}</h2>
                  <p>{idea}</p>
                </div>
              </aside>
            )}
            {notions.length >= 3 && (
              <section aria-labelledby="notions-h">
                <h2 id="notions-h" className="preview-h2">{p.keyNotions}</h2>
                <ul className="notions">
                  {notions.map((g) => (
                    <li key={g.term}>
                      <b>{g.term}</b>
                      <span>{g.definition}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
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
                      <span className="row-text long-text"><b>{d.title}</b><small>{l.openOriginal}</small></span>
                      <Icon name="chevron" className="row-chevron" />
                    </a>
                  ) : (
                    <div className="row row-static">
                      <span className="row-icon"><Icon name="file" /></span>
                      <span className="row-text long-text"><b>{d.title}</b><small>{l.originalGone}</small></span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="meta">{l.sourcesNote}</p>
            <Link href="/" className="btn btn-block">{l.addSource}</Link>
          </section>
        )}

        {tab === "supports" && (
          <section aria-labelledby="supports-h">
            <h2 id="supports-h" className="sr-only">{l.tabs.supports}</h2>
            <ul className="rows">
              <li>
                <Link href={`/rapports/${id}/annexes`} className="row">
                  <span className="row-icon"><Icon name="list" /></span>
                  <span className="row-text"><b>{l.annexes[0]}</b><small>{l.annexes[1]}</small></span>
                  <Icon name="chevron" className="row-chevron" />
                </Link>
              </li>
              <li>
                <PdfLink href={`/api/reports/${id}/pdf`} title={l.pdf[0]} sub={l.pdf[1]} />
              </li>
            </ul>
          </section>
        )}
        <footer className="footer preview-foot">{t.brand.poweredBy}</footer>
      </div>

      <div className="action-dock">
        <ReportLink href={`/rapports/${id}`} className="btn btn-primary" immersive>
          <Icon name="file" size={20} /> {p.presentation}
        </ReportLink>
        {hasQuiz ? (
          <ReportLink href={`/rapports/${id}?ouvrir=bilan`} className="btn" immersive>
            <Icon name="quiz-v4" size={20} /> {p.quiz}
          </ReportLink>
        ) : (
          <button type="button" className="btn" disabled title={p.quizMissing}>
            <Icon name="quiz-v4" size={20} /> {p.quiz}
            <span className="sr-only"> — {p.quizMissing}</span>
          </button>
        )}
      </div>
      <ChatFab reportId={id} />
    </div>
  );
}
