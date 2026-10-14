import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Cover } from "@/components/library/Cover";
import { ChatFab } from "@/components/reader/ChatFab";
import { PdfLink } from "@/components/reader/PdfLink";
import { ReportLink } from "@/components/ReportLink";
import { MindMapView } from "@/components/supports/MindMapView";
import { Revisions } from "@/components/supports/Revisions";
import { SupportState } from "@/components/supports/SupportState";
import { requireUser } from "@/lib/auth";
import { ACTION_PRICES, reportAction, supportAction } from "@/lib/billing/catalog";
import { getT } from "@/lib/i18n/server";
import { lessonCover } from "@/lib/library/covers";
import { automaticSettings } from "@/lib/reports/create";
import { loadReport } from "@/lib/reports/load";
import { createUserClient } from "@/lib/supabase/server";
import { loadSupports } from "@/lib/supports/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.lesson.title };
}

const TABS = ["apercu", "carte", "revisions", "autres"] as const;
type Tab = (typeof TABS)[number];
/** Anciennes adresses (V4) : Sources et Supports sont regroupés dans « Autres ». */
const LEGACY: Record<string, Tab> = { sources: "autres", supports: "autres" };

/**
 * Cours (prompt « Supports et révisions », § 4) : Aperçu, Carte mentale, Révisions, Autres.
 * Titre, retour, menu du cours et chat flottant conservés ; actions adaptées à chaque onglet
 * (plus de dock fixe). Un changement d'onglet ne relance aucune génération ; les supports prêts
 * restent consultables quand un autre est en préparation ou en échec.
 */
export default async function LessonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ onglet?: string; chapitre?: string }> }) {
  const [t, { id }, { onglet, chapitre }] = await Promise.all([getT(), params, searchParams]);
  const user = await requireUser();
  const report = await loadReport(id);
  if (!report) notFound();
  if (report.state !== "ready") redirect(`/rapports/${id}`);
  const supabase = await createUserClient();
  const [{ data: extra }, supports] = await Promise.all([
    supabase.from("reports").select("cover_id, cover_path, cover_url, cover_credit").eq("id", id).maybeSingle(),
    loadSupports(id, report.versionId),
  ]);
  const cover = lessonCover(id, (extra?.cover_id as string | null) ?? null, (extra?.cover_path as string | null) ?? null, {
    url: extra?.cover_url as string | null,
    credit: extra?.cover_credit,
  });
  const requestedTab = onglet ? (LEGACY[onglet] ?? onglet) : "apercu";
  const tab: Tab = (TABS as readonly string[]).includes(requestedTab) ? (requestedTab as Tab) : "apercu";
  const l = t.lesson;
  const s = t.supports;
  const ex = report.explanation;
  const essential = ex.key_points?.length ? ex.key_points : ex.sections.slice(0, 3).map((x) => x.takeaway);
  const hasBook = supports.requested.includes("livre");
  const hasPath = supports.requested.includes("parcours");
  const tabHref = (k: Tab) => (k === "apercu" ? `/rapports/${id}/apercu` : `/rapports/${id}/apercu?onglet=${k}`);
  // Coût d'un support à ajouter, annoncé avant le lancement (taille réelle du cours).
  const missing = (["carte", "flashcards"] as const).some((k) => supports[k].status === "absent" || supports[k].status === "failed");
  const addCost = missing
    ? ACTION_PRICES[supportAction(reportAction((await automaticSettings(user.id, report.documents.map((d) => d.sourceId))).pages))]
    : null;
  const chapters = ex.sections.map((x) => ({ id: x.id, title: x.question }));
  // Révisions : progression personnelle et session en cours (lecture seule, sous RLS).
  const [{ data: progressRows }, { data: active }] =
    tab === "revisions" && supports.flashcards.data
      ? await Promise.all([
          supabase.from("flashcard_progress").select("card_id, next_review_at, last_rating").eq("report_id", id).limit(1000),
          supabase.from("flashcard_sessions").select("id, queue, position, revealed_card_id").eq("report_id", id).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        ])
      : [{ data: null }, { data: null }];
  const progress = Object.fromEntries(((progressRows ?? []) as { card_id: string; next_review_at: string | null; last_rating: string | null }[]).map((p) => [p.card_id, { next_review_at: p.next_review_at, last_rating: p.last_rating }]));
  const session = active
    ? { id: active.id as string, queue: (Array.isArray(active.queue) ? active.queue : []) as string[], position: active.position as number, revealed: (active.revealed_card_id as string | null) ?? null }
    : null;
  const glossary = [...ex.glossary, ...ex.sections.flatMap((x) => x.notions ?? [])].map((g) => ({ term: g.term, definition: g.definition }));

  return (
    <div className="preview-shell lesson-page course-page">
      <header className="preview-head">
        <Link href="/bibliotheque" className="icon-button" aria-label={l.back}><Icon name="back" size={22} /></Link>
        <h1 className="preview-title">{report.title}</h1>
        <Link href={`/rapports/${id}?ouvrir=options`} className="icon-button" aria-label={l.options}><Icon name="more" size={22} /></Link>
      </header>
      <nav className="utabs preview-tabs course-tabs" aria-label={s.tabsLabel}>
        {TABS.map((k) => (
          <Link key={k} href={tabHref(k)} aria-current={tab === k ? "page" : undefined} replace scroll={false}>{s.tabs[k]}</Link>
        ))}
      </nav>

      <div className="preview-scroll">
        {tab === "apercu" && (
          <>
            <Cover cover={cover} className="preview-cover" eager />
            <div className="course-actions">
              {hasBook && (
                <ReportLink href={`/rapports/${id}?vue=livre`} className="course-action is-primary" immersive>
                  <span className="course-action-ic" aria-hidden="true"><Icon name="book" size={22} /></span>
                  <span><b>{s.readBook}</b><small>{s.readBookSub}</small></span>
                  <Icon name="chevron" size={18} />
                </ReportLink>
              )}
              {hasPath && (
                <ReportLink href={`/rapports/${id}?vue=guide`} className={`course-action${hasBook ? "" : " is-primary"}`} immersive>
                  <span className="course-action-ic" aria-hidden="true"><Icon name="path" size={22} /></span>
                  <span><b>{s.continuePath}</b><small>{s.continuePathSub}</small></span>
                  <Icon name="chevron" size={18} />
                </ReportLink>
              )}
              {!hasBook && !hasPath && (
                <ReportLink href={`/rapports/${id}`} className="course-action" immersive>
                  <span className="course-action-ic" aria-hidden="true"><Icon name="file" size={22} /></span>
                  <span><b>{s.openCourse}</b><small>{s.readBookSub}</small></span>
                  <Icon name="chevron" size={18} />
                </ReportLink>
              )}
            </div>
            <section className="preview-card" aria-labelledby="essential-h">
              <h2 id="essential-h">{l.essential}</h2>
              {ex.course_goal && <p className="course-goal">{ex.course_goal}</p>}
              {essential.length > 1 ? (
                <ul className="preview-points">
                  {essential.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              ) : (
                <p>{essential[0]}</p>
              )}
            </section>
            <section aria-labelledby="toc-h">
              <h2 id="toc-h" className="preview-h2">{s.chapters}</h2>
              <ol className="course-toc">
                {ex.sections.map((x, i) => (
                  <li key={x.id}>
                    <ReportLink href={`/rapports/${id}?a=${encodeURIComponent(x.id)}`} immersive>
                      <span className="course-toc-n" aria-hidden="true">{i + 1}</span>
                      <span><span className="sr-only">{s.chapterN(i + 1)} : </span>{x.question}</span>
                    </ReportLink>
                  </li>
                ))}
              </ol>
            </section>
            {(["carte", "flashcards"] as const).map((k) =>
              supports[k].status !== "ready" && (supports.requested.includes(k) || supports[k].status !== "absent") ? (
                <SupportState key={k} reportId={id} support={k} status={supports[k].status} progress={supports[k].progress} cost={addCost} compact />
              ) : null,
            )}
          </>
        )}

        {tab === "carte" && (
          <>
            {supports.carte.data ? (
              <>
                {supports.carte.outdated && <p className="support-chip">{s.status.outdated}</p>}
                <MindMapView reportId={id} map={supports.carte.data} glossary={glossary} />
              </>
            ) : null}
            <SupportState reportId={id} support="carte" status={supports.carte.status} progress={supports.carte.progress} cost={addCost} />
          </>
        )}

        {tab === "revisions" && (
          <>
            <Revisions
              reportId={id}
              bank={supports.flashcards.data}
              outdated={supports.flashcards.outdated}
              chapters={chapters}
              initialChapter={chapitre ?? null}
              hasBilan={!!report.exercises?.bilan.length}
              chapterQuizzes={ex.sections.filter((x) => (x.quiz?.length ?? 0) > 0).length}
              visuals={report.blueprint.visual_specs}
              assets={report.assets}
              progress={progress}
              session={session}
            />
            <SupportState reportId={id} support="flashcards" status={supports.flashcards.status} progress={supports.flashcards.progress} cost={addCost} />
          </>
        )}

        {tab === "autres" && (
          <>
            <section aria-labelledby="sources-h">
              <h2 id="sources-h" className="preview-h2">{s.others.sources}</h2>
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
            </section>
            <section aria-labelledby="annexes-h">
              <h2 id="annexes-h" className="preview-h2">{s.others.annexes}</h2>
              <ul className="rows">
                <li>
                  <Link href={`/rapports/${id}/annexes`} className="row">
                    <span className="row-icon"><Icon name="list" /></span>
                    <span className="row-text"><b>{l.annexes[0]}</b><small>{l.annexes[1]}</small></span>
                    <Icon name="chevron" className="row-chevron" />
                  </Link>
                </li>
                <li>
                  <Link href={`/rapports/${id}/annexes#glossaire`} className="row">
                    <span className="row-icon"><Icon name="definition" /></span>
                    <span className="row-text"><b>{s.others.glossary}</b><small>{t.v4.preview.keyNotions}</small></span>
                    <Icon name="chevron" className="row-chevron" />
                  </Link>
                </li>
              </ul>
            </section>
            <section aria-labelledby="exports-h">
              <h2 id="exports-h" className="preview-h2">{s.others.exports}</h2>
              <ul className="rows">
                <li>
                  <PdfLink href={`/api/reports/${id}/pdf`} title={l.pdf[0]} sub={l.pdf[1]} />
                </li>
              </ul>
            </section>
            <Link href="/" className="btn btn-block">{l.addSource}</Link>
          </>
        )}
        <footer className="footer preview-foot">{t.brand.poweredBy}</footer>
      </div>
      <ChatFab reportId={id} />
    </div>
  );
}
