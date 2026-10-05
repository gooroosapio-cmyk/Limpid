import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { Evidence, ExplanationObject, ReportBlueprint, SourceSegment } from "@/lib/contracts/schemas";
import type { Dict } from "@/lib/i18n";
import { sourceAnchor, termAnchor } from "@/lib/render/anchors";
import { sourceEntries } from "@/lib/render/sources";
import { GlossaryList } from "./GlossaryList";
import { buildNotions } from "./v4/Pieces";

/**
 * Page Annexes (V5, § 14) : glossaire, sources et limites d'un Limpid, en lecture continue,
 * hors du carrousel. Tout vient du rapport enregistré : aucune génération, aucun OCR. Les
 * réponses aux exercices n'y figurent jamais.
 */
export function AnnexesView({
  t,
  title,
  backHref,
  blueprint,
  explanation,
  evidence,
  segments,
  documents,
  notes = [],
  versionLabel = null,
  expiry = null,
}: {
  t: Dict;
  title: string;
  /** Retour au rapport, à l'ancre de lecture quand elle est connue. */
  backHref: string;
  blueprint: ReportBlueprint;
  explanation: ExplanationObject;
  evidence: Evidence[];
  segments: SourceSegment[];
  /** Documents du Limpid (titre, original consultable) ; plusieurs = Limpid commun. */
  documents: { sourceId: string; title: string; originalHref: string | null }[];
  notes?: string[];
  versionLabel?: string | null;
  expiry?: string | null;
}) {
  const titles = Object.fromEntries(documents.map((d) => [`src_${d.sourceId}`, d.title]));
  const { numbers, entries } = sourceEntries(blueprint, evidence, segments, titles);
  const notions = buildNotions(explanation, numbers);
  const glossary = notions.map((n) => ({
    id: termAnchor(n.term),
    term: n.term,
    definition: n.definition,
    refs: n.refs.map((r) => ({ n: r.n, href: `#${sourceAnchor(r.n)}` })),
  }));
  const multi = documents.length > 1;
  const groups = multi
    ? documents.map((d) => ({ doc: d, list: entries.filter((e) => e.document === d.title) })).filter((g) => g.list.length)
    : [{ doc: documents[0] ?? null, list: entries }];
  const limits = [...explanation.limitations];

  return (
    <div className="annex-page">
      <div className="annex-top">
        <Link href={backHref} className="btn annex-back">
          <Icon name="back" /> {t.lim.annexBack}
        </Link>
      </div>
      <header id="annexes" className="annex-head annex-target">
        <p className="eyebrow">{t.lim.annexTitle}{versionLabel ? ` · ${versionLabel}` : ""}</p>
        <h1>{title}</h1>
        <p className="muted">{t.lim.annexLede}</p>
        <nav aria-label={t.lim.annexNav} className="annex-nav">
          <a href="#glossaire">{t.lim.optGlossary}</a>
          <a href="#sources">{t.lim.optSources}</a>
          {(limits.length > 0 || notes.length > 0) && <a href="#limites">{t.lim.limits}</a>}
        </nav>
      </header>

      <section id="glossaire" aria-labelledby="glossaire-h" className="annex-section annex-target">
        <h2 id="glossaire-h">{t.lim.optGlossary}</h2>
        {glossary.length ? <GlossaryList items={glossary} /> : <p className="muted">{t.lim.noGlossary}</p>}
      </section>

      <section id="sources" aria-labelledby="sources-h" className="annex-section annex-target">
        <h2 id="sources-h">{t.lim.optSources}</h2>
        {entries.length === 0 && <p className="muted">{t.lim.annexNoSources}</p>}
        {groups.map(({ doc, list }) => (
          <div key={doc?.sourceId ?? "doc"} className="annex-doc">
            {doc && (
              <div className="annex-doc-head">
                <p className="annex-doc-title"><Icon name="file" size={18} /> <span>{doc.title}</span></p>
                {doc.originalHref ? (
                  <a className="btn-link small" href={doc.originalHref} target="_blank" rel="noopener noreferrer nofollow">{t.lim.original}</a>
                ) : (
                  <p className="muted small">{t.lim.originalMissing}</p>
                )}
              </div>
            )}
            <ol className="annex-sources">
              {list.map((e) => (
                <li key={e.evidenceId} id={sourceAnchor(e.n)} className="annex-target">
                  <span className="src-n" aria-hidden="true">{e.n}</span>
                  <div>
                    <p className="annex-loc"><span className="sr-only">[{e.n}] </span>{multi && e.document ? e.location.slice(e.document.length + 2) : e.location}</p>
                    <blockquote className="annex-quote">
                      {e.before && <span className="muted">… {e.before} </span>}
                      <mark>{e.quote}</mark>
                      {e.after && <span className="muted"> {e.after} …</span>}
                    </blockquote>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      {(limits.length > 0 || notes.length > 0) && (
        <section id="limites" aria-labelledby="limites-h" className="annex-section annex-target">
          <h2 id="limites-h">{t.lim.limits}</h2>
          {limits.length > 0 && <ul>{limits.map((l) => <li key={l}>{l}</li>)}</ul>}
          {notes.length > 0 && (
            <>
              <h3>{t.lim.annexNotes}</h3>
              <ul>{notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </>
          )}
        </section>
      )}

      {expiry && (
        <section aria-labelledby="conservation-h" className="annex-section">
          <h2 id="conservation-h">{t.lim.annexConservation}</h2>
          <p className="muted small">{expiry}</p>
        </section>
      )}

      <div className="annex-top annex-bottom">
        <Link href={backHref} className="btn btn-block annex-back">
          <Icon name="back" /> {t.lim.annexBack}
        </Link>
      </div>
    </div>
  );
}
