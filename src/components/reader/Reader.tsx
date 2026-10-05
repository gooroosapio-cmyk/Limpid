import { z } from "zod";
import type { Evidence, ExplanationObject, ReportBlueprint, SourceSegment, ThemeId } from "@/lib/contracts/schemas";
import { sourceEntries } from "@/lib/render/sources";
import { showsIllustrations } from "@/lib/display/themes";
import { safeHref } from "@/lib/render/visuals";
import { LEVEL_LABELS } from "@/lib/labels";
import { fr } from "@/lib/i18n/fr";
import { splitTerms, termMatcher } from "@/lib/render/terms";
import { VisualFigure, type AssetView } from "./Visuals";
import { CheckQuiz } from "./CheckQuiz";
import { NotionTerm, NotionsProvider, type Notion } from "./Notions";
import { ReaderBar } from "./ReaderBar";
import { SourceRef, SourcesProvider } from "./Sources";

/** Correction enregistrée, revalidée avant affichage. */
const FeedbackSchema = z.object({
  verdict: z.enum(["correct", "partial", "incorrect"]),
  points: z.array(z.object({ index: z.number(), covered: z.boolean() })),
  feedback: z.string(),
  misconception: z.string().nullable(),
});

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

/** Notions du rapport et occurrences déjà soulignées (rendu serveur, dans l'ordre de lecture). */
interface Terms {
  matcher: RegExp | null;
  list: string[];
  used: Set<string>;
}

function Linked({ text, terms }: { text: string; terms: Terms }) {
  return (
    <>
      {splitTerms(text, terms.matcher, terms.list, terms.used).map((p, i) =>
        typeof p === "string" ? p : <NotionTerm key={i} term={p.term}>{p.text}</NotionTerm>,
      )}
    </>
  );
}

function BlockView({ block, numbers, terms }: { block: Block; numbers: Map<string, number>; terms: Terms }) {
  const refs = <Refs ids={block.evidence_ids} numbers={numbers} />;
  switch (block.type) {
    case "fact":
      return <p className="block"><Linked text={block.text} terms={terms} /> {refs}</p>;
    case "definition":
      return (
        <p className="block block-definition">
          <span className="block-label">{fr.reader.definition}</span>
          <br />
          <dfn>{block.term}</dfn> — <Linked text={block.text} terms={terms} /> {refs}
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
          <Linked text={block.text} terms={terms} /> {refs}
        </p>
      );
    case "caution":
      return (
        <div className="block block-caution">
          <span className="block-label">{fr.reader.caution}</span>
          <p><Linked text={block.text} terms={terms} /> {refs}</p>
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
  originalHref = null,
  isDemo,
  reportId = null,
  answers,
  actions = null,
  actionsNote = null,
  sectionActions,
  theme = "sciences",
  assets = {},
  footer = null,
}: {
  blueprint: ReportBlueprint;
  explanation: ExplanationObject;
  evidence: Evidence[];
  segments: SourceSegment[];
  sourceTitle: string;
  /** Adresse de la page d'origine (import par lien). */
  sourceUrl?: string | null;
  /** Original consultable (fichier gardé 30 jours ou page d'origine). */
  originalHref?: string | null;
  isDemo: boolean;
  /** Rapport réel : active la correction des réponses (null pour la démonstration). */
  reportId?: string | null;
  answers?: Record<string, { answer: string; feedback: unknown }>;
  /** Réécriture du rapport (« Plus simple », « Un autre exemple »), en fin de lecture. */
  actions?: React.ReactNode;
  actionsNote?: string | null;
  /** Actions propres à une partie (réécriture ciblée), rendues sous chaque section. */
  sectionActions?: (sectionId: string, question: string) => React.ReactNode;
  /** Présentation : composition seulement, même contenu (cahier V2, § 8). */
  theme?: ThemeId;
  /** Illustrations disponibles, par identifiant d'actif. */
  assets?: Record<string, AssetView>;
  /** Mention de fin (conservation). */
  footer?: React.ReactNode;
}) {
  const { numbers, entries } = sourceEntries(blueprint, evidence, segments);
  const originalLink = originalHref ?? safeHref(sourceUrl);
  const sections = new Map(explanation.sections.map((s) => [s.id, s]));
  const visuals = new Map(blueprint.visual_specs.map((v) => [v.id, v]));
  const first = explanation.sections[0];
  const notions = buildNotions(explanation, numbers);
  const termList = notions.map((n) => n.term);
  const terms: Terms = { matcher: termMatcher(termList), list: termList, used: new Set() };
  const toc = blueprint.sections.flatMap((bs) => {
    const s = sections.get(bs.section_id);
    return s ? [{ id: s.id, question: s.question }] : [];
  });
  const hasChecks = explanation.checks.length > 0;

  return (
    <SourcesProvider entries={entries} sourceTitle={sourceTitle} originalHref={originalLink}>
      <NotionsProvider notions={notions} checkHref={hasChecks ? "#verifier" : null}>
      <article aria-labelledby="report-title" className={`reader theme-${theme}`}>
        <p className="eyebrow reader-eyebrow">
          {isDemo && <span className="badge badge-demo">{fr.demo.badge}</span>} {LEVEL_LABELS[explanation.level]} · {fr.reader.eyebrow(toc.length, notions.length)}
        </p>
        <h1 id="report-title" className="reader-title">{blueprint.title}</h1>
        {first && <p className="reader-dek">{first.question}</p>}

        {first && (
          <aside className="takeaway" aria-label={fr.reader.essential}>
            <strong>{fr.reader.essential}</strong>
            <ul>
              {explanation.sections.map((s) => <li key={s.id}>{s.takeaway}</li>)}
            </ul>
          </aside>
        )}

        {blueprint.sections.map((bs) => {
          const s = sections.get(bs.section_id);
          if (!s) return null;
          return (
            <section key={s.id} id={s.id} className="reader-section" aria-labelledby={`${s.id}-h`}>
              <h2 id={`${s.id}-h`}>{s.question}</h2>
              {s.blocks.map((b) => <BlockView key={b.id} block={b} numbers={numbers} terms={terms} />)}
              {sectionActions && (
                <div className="section-actions" role="group" aria-label={fr.reader.sectionActions(s.question)}>
                  {sectionActions(s.id, s.question)}
                </div>
              )}
              {bs.visual_ids.map((vid) => {
                const v = visuals.get(vid);
                if (!v) return null;
                const assetId = v.kind === "illustration" ? (v.data as { asset_id?: unknown }).asset_id : null;
                return (
                  <VisualFigure
                    key={v.id}
                    visual={v}
                    refs={<Refs ids={v.evidence_ids} numbers={numbers} />}
                    asset={typeof assetId === "string" ? assets[assetId] : undefined}
                    // Essentiel : davantage de texte, pas d'images décoratives.
                    showIllustrations={showsIllustrations(theme)}
                  />
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
          <section id="verifier" className="reader-section" aria-labelledby="check-h">
            <h2 id="check-h">{fr.reader.check}</h2>
            {reportId && <p className="muted">{fr.reader.checkIntro}</p>}
            {explanation.checks.map((c) => {
              const prior = answers?.[c.id];
              const fb = prior ? FeedbackSchema.safeParse(prior.feedback) : null;
              return (
                <CheckQuiz
                  key={c.id}
                  reportId={reportId}
                  checkId={c.id}
                  question={c.question}
                  expectedPoints={c.expected_points}
                  refs={<Refs ids={c.evidence_ids} numbers={numbers} />}
                  initial={prior && fb?.success ? { answer: prior.answer, feedback: fb.data } : null}
                />
              );
            })}
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
            {originalLink && (
              <>
                {" — "}
                <a href={originalLink} rel="noopener noreferrer nofollow" target="_blank">{fr.reader.openOriginal}</a>
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

        {actions && (
          <section className="reader-section" aria-labelledby="notclear-h">
            <h2 id="notclear-h">{fr.reader.notClear}</h2>
            <div className="reader-actions" role="group" aria-labelledby="notclear-h">{actions}</div>
            {actionsNote && <p className="muted small">{actionsNote}</p>}
          </section>
        )}
        {!actions && actionsNote && <p className="muted small">{actionsNote}</p>}
        {footer}
      </article>
      <ReaderBar toc={toc} hasChecks={hasChecks} />
      </NotionsProvider>
    </SourcesProvider>
  );
}

/** Notions : glossaire puis définitions du texte (avec leurs extraits), une entrée par terme. */
function buildNotions(explanation: ExplanationObject, numbers: Map<string, number>): Notion[] {
  const byKey = new Map<string, Notion>();
  for (const s of explanation.sections) {
    for (const b of s.blocks) {
      if (b.type !== "definition") continue;
      const key = b.term.trim().toLowerCase();
      if (byKey.has(key)) continue;
      const refs = b.evidence_ids.flatMap((id) => {
        const n = numbers.get(id);
        return n ? [{ n, evidenceId: id }] : [];
      });
      byKey.set(key, { term: b.term.trim(), definition: b.text, refs });
    }
  }
  for (const g of explanation.glossary) {
    const key = g.term.trim().toLowerCase();
    if (!byKey.has(key)) byKey.set(key, { term: g.term.trim(), definition: g.definition, refs: [] });
  }
  return [...byKey.values()];
}
