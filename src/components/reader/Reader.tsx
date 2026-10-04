import type { Evidence, ExplanationObject, ReportBlueprint, SourceSegment } from "@/lib/contracts/schemas";
import { sourceEntries } from "@/lib/render/sources";
import { FlowData } from "@/lib/render/visuals";
import { LEVEL_LABELS } from "@/lib/labels";
import { fr } from "@/lib/i18n/fr";
import { FlowDiagram } from "./FlowDiagram";
import { SourceRef, SourcesProvider } from "./Sources";

type Block = ExplanationObject["sections"][number]["blocks"][number];

function Refs({ ids, numbers }: { ids: string[]; numbers: Map<string, number> }) {
  return (
    <>
      {ids.map((id) => {
        const n = numbers.get(id);
        return n ? <SourceRef key={id} n={n} evidenceId={id} /> : null;
      })}
    </>
  );
}

function BlockView({ block, numbers }: { block: Block; numbers: Map<string, number> }) {
  const refs = <Refs ids={block.evidence_ids} numbers={numbers} />;
  switch (block.type) {
    case "fact":
      return <p className="block">{block.text} {refs}</p>;
    case "definition":
      return (
        <p className="block block-definition">
          <span className="block-label">{fr.reader.definition}</span>
          <br />
          <dfn>{block.term}</dfn> — {block.text} {refs}
        </p>
      );
    case "analogy":
      return (
        <div className="block block-analogy">
          <span className="block-label">{fr.reader.analogy}</span>
          <p>{block.text}</p>
          <p className="limit"><strong>{fr.reader.analogyLimit}</strong> {block.limit}</p>
        </div>
      );
    case "fictional_example":
      return (
        <div className="block block-example">
          <span className="block-label">{fr.reader.fictional}</span>
          <p>{block.text}</p>
        </div>
      );
    case "inference":
      return (
        <p className="block">
          <span className="block-label">{fr.reader.inference}</span>
          <br />
          {block.text} {refs}
        </p>
      );
    case "caution":
      return (
        <div className="block block-caution">
          <span className="block-label">{fr.reader.caution}</span>
          <p>{block.text} {refs}</p>
        </div>
      );
  }
}

export function Reader({
  blueprint,
  explanation,
  evidence,
  segments,
  sourceTitle,
  sourceUrl = null,
  pdfHref,
  isDemo,
}: {
  blueprint: ReportBlueprint;
  explanation: ExplanationObject;
  evidence: Evidence[];
  segments: SourceSegment[];
  sourceTitle: string;
  /** Adresse de la page d'origine (import par lien). */
  sourceUrl?: string | null;
  /** Lien de téléchargement du PDF. */
  pdfHref: string;
  isDemo: boolean;
}) {
  const { numbers, entries } = sourceEntries(blueprint, evidence, segments);
  const sections = new Map(explanation.sections.map((s) => [s.id, s]));
  const visuals = new Map(blueprint.visual_specs.map((v) => [v.id, v]));
  const first = explanation.sections[0];

  return (
    <SourcesProvider entries={entries} sourceTitle={sourceTitle}>
      <article aria-labelledby="report-title">
        {isDemo && <span className="badge badge-demo">{fr.demo.badge}</span>}{" "}
        <span className="badge">{LEVEL_LABELS[explanation.level]}</span>
        <h1 id="report-title" className="reader-title">{blueprint.title}</h1>

        {first && (
          <aside className="takeaway" aria-label={fr.reader.essential}>
            <strong>{fr.reader.essential}</strong>
            <ul>
              {explanation.sections.map((s) => <li key={s.id}>{s.takeaway}</li>)}
            </ul>
          </aside>
        )}

        <nav className="toc card" aria-labelledby="toc-title">
          <h2 id="toc-title">{fr.reader.toc}</h2>
          <ol>
            {blueprint.sections.map((bs) => {
              const s = sections.get(bs.section_id);
              return s ? <li key={s.id}><a href={`#${s.id}`}>{s.question}</a></li> : null;
            })}
          </ol>
        </nav>

        {blueprint.sections.map((bs) => {
          const s = sections.get(bs.section_id);
          if (!s) return null;
          return (
            <section key={s.id} id={s.id} className="reader-section" aria-labelledby={`${s.id}-h`}>
              <h2 id={`${s.id}-h`}>{s.question}</h2>
              {s.blocks.map((b) => <BlockView key={b.id} block={b} numbers={numbers} />)}
              {bs.visual_ids.map((vid) => {
                const v = visuals.get(vid);
                if (!v || v.kind !== "flow") return null;
                const parsed = FlowData.safeParse(v.data);
                if (!parsed.success) return null; // visuel invalide : le texte reste seul
                return (
                  <figure key={v.id} className="visual">
                    <FlowDiagram data={parsed.data} labelledBy={`${v.id}-alt`} />
                    <figcaption>
                      {v.caption} <Refs ids={v.evidence_ids} numbers={numbers} />
                    </figcaption>
                    <details>
                      <summary>{fr.reader.textAlternative}</summary>
                      <p id={`${v.id}-alt`}>{v.alt_text}</p>
                    </details>
                  </figure>
                );
              })}
            </section>
          );
        })}

        {explanation.glossary.length > 0 && (
          <section className="reader-section" aria-labelledby="glossary-h">
            <h2 id="glossary-h">{fr.reader.glossary}</h2>
            <dl className="glossary">
              {explanation.glossary.map((g) => (
                <div key={g.term}>
                  <dt>{g.term}</dt>
                  <dd>{g.definition}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {explanation.checks.length > 0 && (
          <section className="reader-section" aria-labelledby="check-h">
            <h2 id="check-h">{fr.reader.check}</h2>
            {explanation.checks.map((c) => (
              <div key={c.id} className="card">
                <p>{c.question}</p>
                <details>
                  <summary>Éléments de réponse</summary>
                  <ul>{c.expected_points.map((p) => <li key={p}>{p}</li>)}</ul>
                  <Refs ids={c.evidence_ids} numbers={numbers} />
                </details>
              </div>
            ))}
          </section>
        )}

        <section className="reader-section" aria-labelledby="limits-h">
          <h2 id="limits-h">{fr.reader.limits}</h2>
          <ul>{explanation.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        </section>

        <section className="reader-section" aria-labelledby="sources-h">
          <h2 id="sources-h">{fr.reader.sources}</h2>
          <p className="muted">
            {sourceTitle}
            {sourceUrl && (
              <>
                {" — "}
                <a href={sourceUrl} rel="noopener noreferrer nofollow" target="_blank">{fr.reader.original}</a>
              </>
            )}
          </p>
          <ol>
            {entries.map((e) => (
              <li key={e.evidenceId}>
                {e.location} — « {e.quote} »
              </li>
            ))}
          </ol>
        </section>

        <div className="reader-actions" role="group" aria-label="Actions sur le rapport" aria-describedby="actions-note">
          <button className="btn" disabled>{fr.reader.simpler}</button>
          <button className="btn" disabled>{fr.reader.otherExample}</button>
          <button className="btn" disabled>{fr.reader.check}</button>
          <a className="btn btn-primary" href={pdfHref} download>{fr.reader.pdf}</a>
        </div>
        <p id="actions-note" className="muted">{fr.reader.actionsDisabled}</p>
      </article>
    </SourcesProvider>
  );
}
