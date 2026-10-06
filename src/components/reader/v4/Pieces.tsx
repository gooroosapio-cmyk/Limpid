/**
 * Moteur éditorial de Limpid (V4, § 6-7) : le document structuré devient une suite de
 * « pièces » (couverture, titre de partie, bloc, élément de liste, visuel, point de contrôle,
 * fin). Les annexes sont une page à part, hors du carrousel. Le lecteur mesure leurs hauteurs réelles et compose les vues sans débordement :
 * aucune pièce n'est tronquée, réduite ou masquée. Rendu serveur, sans HTML injecté.
 */
import { Fragment } from "react";
import type { Block, Evidence, ExerciseSet, ExplanationObject, ReportBlueprint, SourceSegment, VisualSpec } from "@/lib/contracts/schemas";
import type { Dict } from "@/lib/i18n";
import { parseRich, splitParagraph } from "@/lib/reader/rich";
import { sourceEntries, type SourceEntry } from "@/lib/render/sources";
import { splitTerms, termMatcher } from "@/lib/render/terms";
import { NotionTerm, type Notion } from "../Notions";
import { SourceRef } from "../Sources";
import { VisualFigure, type AssetView } from "../Visuals";
import { ChapterCheck } from "./ChapterCheck";
import { AnnexLinks, EndActions } from "./EndActions";
import { ExampleBlock } from "./ExampleBlock";
import { Calculation } from "../v6/Calculation";
import { Chart } from "../v6/Chart";
import { Comparison } from "../v6/Comparison";
import { Details } from "../v6/Details";
import { Essential } from "../v6/Essential";
import { Proportion } from "../v6/Proportion";
import { Scene } from "../v6/Scene";
import { Steps } from "../v6/Steps";
import { Timeline } from "../v6/Timeline";

/** Taille des groupes des longues listes (une pièce = un groupe insécable). */
const CHUNK = 100;

interface Terms {
  matcher: RegExp | null;
  list: string[];
  used: Set<string>;
}

interface Ctx {
  t: Dict;
  numbers: Map<string, number>;
  terms: Terms;
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Texte du modèle : gras/italique légers, notions soulignées à leur première occurrence. */
function Rich({ text, ctx, linkTerms = true }: { text: string; ctx: Ctx; linkTerms?: boolean }) {
  return (
    <>
      {parseRich(text).map((run, i) => {
        const parts = linkTerms ? splitTerms(run.text, ctx.terms.matcher, ctx.terms.list, ctx.terms.used) : [run.text];
        const inner = parts.map((p, k) =>
          typeof p === "string" ? <Fragment key={k}>{p}</Fragment> : <NotionTerm key={k} term={p.term}>{p.text}</NotionTerm>,
        );
        if (run.bold) return <strong key={i}>{inner}</strong>;
        if (run.italic) return <em key={i}>{inner}</em>;
        return <Fragment key={i}>{inner}</Fragment>;
      })}
    </>
  );
}

function Refs({ ids, ctx }: { ids: string[]; ctx: Ctx }) {
  const refs = [...new Set(ids)].flatMap((id) => {
    const n = ctx.numbers.get(id);
    return n ? [<SourceRef key={id} n={n} evidenceId={id} />] : [];
  });
  return refs.length ? <span className="refs">{refs}</span> : null;
}

type PieceAttrs = { keep?: boolean; breakBefore?: boolean; breakAfter?: boolean; section?: string };
function attrs(a: PieceAttrs) {
  return {
    "data-piece": "",
    ...(a.keep ? { "data-keep": "1" } : {}),
    ...(a.breakBefore ? { "data-break-before": "1" } : {}),
    ...(a.breakAfter ? { "data-break-after": "1" } : {}),
    ...(a.section ? { "data-section": a.section } : {}),
  };
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="block-label">{children}</span>;
}

/** Une pièce par bloc ; une liste longue est découpée en groupes (numérotation conservée). */
/**
 * `float` : visuel incrusté dans le bloc (le texte l'entoure puis continue sous son pied) ;
 * le bloc reste alors une seule pièce.
 */
function blockPieces(b: Block, section: string, ctx: Ctx, float?: React.ReactNode): React.ReactNode[] {
  const { t } = ctx;
  const refs = <Refs ids={b.evidence_ids} ctx={ctx} />;
  const piece = (cls: string, body: React.ReactNode, a: PieceAttrs = {}) => (
    <div key={b.id} id={b.id} className={`piece ${cls}${float ? " wrap-host" : ""}`} {...attrs({ section, ...a })}>
      {float}
      {body}
    </div>
  );
  switch (b.type) {
    case "fact":
      if (b.emphasis === "key") return [piece("block block-key", <><Label>{t.lim.keyIdea}</Label><p><Rich text={b.text} ctx={ctx} /> {refs}</p></>)];
      if (float) return [piece("block", <p><Rich text={b.text} ctx={ctx} /> {refs}</p>)];
      // Long paragraphe : paragraphes successifs (fins de phrase), références après la dernière.
      return splitParagraph(b.text).map((part, k, all) => (
        <div key={`${b.id}-${k}`} id={k === 0 ? b.id : `${b.id}-${k}`} className="piece block" {...attrs({ section })}>
          <p><Rich text={part} ctx={ctx} />{k === all.length - 1 && <> {refs}</>}</p>
        </div>
      ));
    case "definition":
      return [
        piece(
          "block block-definition",
          <><Label>{t.lim.definition}</Label><p><dfn>{b.term}</dfn> — <Rich text={b.text} ctx={ctx} linkTerms={false} /> {refs}</p></>,
        ),
      ];
    case "inference":
      return [piece("block block-inference", <><Label>{t.lim.inference}</Label><p><Rich text={b.text} ctx={ctx} /> {refs}</p></>)];
    case "caution":
      return [piece("block block-caution", <><Label>{t.lim.caution}</Label><p><Rich text={b.text} ctx={ctx} /> {refs}</p></>)];
    case "complement":
      return [piece("block block-complement", <><Label>{t.lim.complement}</Label><p><Rich text={b.text} ctx={ctx} linkTerms={false} /></p></>)];
    case "analogy":
    case "fictional_example": {
      const all = [{ text: b.text, limit: b.type === "analogy" ? b.limit : null }, ...(b.variants ?? [])];
      const variants = all.map((v, i) => (
        <Fragment key={i}>
          <p><Rich text={v.text} ctx={ctx} linkTerms={false} /></p>
          {v.limit && <p className="limit"><strong>{t.lim.limit}</strong> {v.limit}</p>}
        </Fragment>
      ));
      return [piece(`block block-${b.type === "analogy" ? "analogy" : "example"}`, <ExampleBlock label={b.type === "analogy" ? t.lim.analogy : t.lim.example} variants={variants} />)];
    }
    case "formula":
      return [
        piece(
          "block block-formula",
          <>
            <p className="formula" role="math" aria-label={b.expression}>{b.expression}</p>
            {b.symbols.length > 0 && (
              <dl className="symbols">
                <dt className="sr-only">{t.lim.symbols}</dt>
                {b.symbols.map((s) => (
                  <div key={s.symbol}><dt>{s.symbol}</dt><dd>{s.meaning}</dd></div>
                ))}
              </dl>
            )}
            <p><Rich text={b.text} ctx={ctx} /> {refs}</p>
          </>,
        ),
      ];
    case "list": {
      const ordered = b.style !== "bullets";
      const groups = chunks(b.items, CHUNK);
      const intro = (
        <p className="list-intro"><Rich text={b.text} ctx={ctx} /> {refs}</p>
      );
      return groups.map((items, g) => {
        const Tag = ordered ? "ol" : "ul";
        const start = g * CHUNK + 1;
        return (
          <div
            key={`${b.id}-${g}`}
            id={g === 0 ? b.id : `${b.id}-${g}`}
            className={`piece block block-list list-${b.style}${g === 0 && float ? " wrap-host" : ""}`}
            {...attrs({ section })}
          >
            {g === 0 && float}
            {g === 0 && intro}
            <Tag {...(ordered ? { start } : {})}>
              {items.map((it, k) => (
                <li key={k}><Rich text={it.text} ctx={ctx} /> <Refs ids={it.evidence_ids} ctx={ctx} /></li>
              ))}
            </Tag>
          </div>
        );
      });
    }
    /* V6 : composants du lecteur dessinés par le code à partir de données exactes. */
    case "steps":
      return [
        piece(
          "block block-v6 block-steps",
          <Steps
            label={t.blocks6.stepsLabel}
            intro={<Rich text={b.text} ctx={ctx} />}
            refs={refs}
            items={b.items.map((it) => ({ title: it.title, body: <Rich text={it.text} ctx={ctx} />, refs: <Refs ids={it.evidence_ids} ctx={ctx} /> }))}
          />,
        ),
      ];
    case "timeline":
      return [
        piece(
          "block block-v6 block-timeline",
          <Timeline
            label={t.blocks6.timeline}
            orderLabel={t.blocks6.order[b.order]}
            intro={<Rich text={b.text} ctx={ctx} />}
            refs={refs}
            events={b.events.map((ev) => ({ date: ev.date, title: ev.title, body: <Rich text={ev.text} ctx={ctx} />, refs: <Refs ids={ev.evidence_ids} ctx={ctx} /> }))}
          />,
        ),
      ];
    case "comparison":
      return [
        piece(
          "block block-v6 block-comparison",
          <Comparison
            label={t.blocks6.comparison}
            scrollLabel={t.blocks6.tableScroll}
            missing={t.blocks6.missing}
            intro={<Rich text={b.text} ctx={ctx} />}
            refs={refs}
            columns={b.columns}
            rows={b.rows.map((r) => ({ cells: r.cells, refs: <Refs ids={r.evidence_ids} ctx={ctx} /> }))}
          />,
        ),
      ];
    case "proportion":
      return [
        piece(
          "block block-v6 block-proportion",
          <Proportion
            base={b.base}
            percent={b.percent}
            unit={b.unit}
            partLabel={b.part_label}
            restLabel={b.rest_label}
            interactive={b.interactive}
            example={b.example}
            intro={<Rich text={b.text} ctx={ctx} />}
            refs={refs}
          />,
        ),
      ];
    case "calculation":
      return [
        piece(
          "block block-v6 block-calculation",
          <Calculation
            formula={b.formula_id}
            variables={[b.variables[0]!, b.variables[1]!]}
            steps={b.steps}
            interactive={b.interactive}
            example={b.example}
            intro={<Rich text={b.text} ctx={ctx} />}
            refs={refs}
          />,
        ),
      ];
    case "chart":
      return [piece("block block-v6 block-chart", <Chart chartType={b.chart_type} unit={b.unit} points={b.points} intro={<Rich text={b.text} ctx={ctx} />} refs={refs} />)];
    case "details":
      return [
        piece(
          "block block-v6 block-details",
          <Details summary={b.summary}>
            <p><Rich text={b.text} ctx={ctx} /> {refs}</p>
          </Details>,
        ),
      ];
    case "scene":
      return [
        piece(
          "block block-v6 block-scene",
          <Scene asset={b.asset} alt={t.blocks6.scenes[b.asset]} note={t.blocks6.sceneNote} caption={<><Rich text={b.text} ctx={ctx} linkTerms={false} /> {refs}</>} />,
        ),
      ];
  }
}

function visualPiece(v: VisualSpec, section: string, ctx: Ctx, assets: Record<string, AssetView>, showIllustrations: boolean, extra?: React.ReactNode) {
  const assetId = v.kind === "illustration" ? (v.data as { asset_id?: unknown }).asset_id : null;
  const asset = typeof assetId === "string" ? assets[assetId] : undefined;
  if (v.kind === "illustration" && (!asset || !showIllustrations)) return null;
  const figure = <VisualFigure visual={v} refs={<Refs ids={v.evidence_ids} ctx={ctx} />} asset={asset} showIllustrations={showIllustrations} />;
  return (
    <div key={v.id} id={v.id} className={`piece piece-visual visual-${v.size ?? "wide"}${extra ? " pair" : ""}`} {...attrs({ section })}>
      {extra ? <><div className="pair-visual">{figure}</div><div className="pair-text">{extra}</div></> : figure}
    </div>
  );
}

/** Notions : définitions du texte (avec leurs extraits) puis glossaire, une entrée par terme. */
export function buildNotions(explanation: ExplanationObject, numbers: Map<string, number>): Notion[] {
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
  // V5 : notions du chapitre (définition simple et exemple préproduits).
  for (const s of explanation.sections) {
    for (const n of s.notions ?? []) {
      const key = n.term.trim().toLowerCase();
      if (byKey.has(key)) continue;
      const claims = new Set(n.claim_ids);
      const ev = s.blocks.filter((b) => b.claim_ids.some((c) => claims.has(c))).flatMap((b) => b.evidence_ids);
      const refs = [...new Set(ev)].slice(0, 3).flatMap((id) => {
        const num = numbers.get(id);
        return num ? [{ n: num, evidenceId: id }] : [];
      });
      byKey.set(key, { term: n.term.trim(), definition: n.definition, example: n.example, refs });
    }
  }
  for (const g of explanation.glossary) {
    const key = g.term.trim().toLowerCase();
    if (!byKey.has(key)) byKey.set(key, { term: g.term.trim(), definition: g.definition, refs: [] });
  }
  return [...byKey.values()];
}

export interface LimpidDoc {
  chapters: { id: string; title: string }[];
  notions: Notion[];
  entries: SourceEntry[];
  pieces: React.ReactNode;
}

/** Compose les pièces d'un Limpid. `status` : avertissements affichés sous la couverture. */
export function composeLimpid({
  t,
  blueprint,
  explanation,
  evidence,
  segments,
  exercises,
  assets = {},
  modeLabel,
  status = null,
  canReformulate,
  isDemo = false,
  documents,
}: {
  t: Dict;
  blueprint: ReportBlueprint;
  explanation: ExplanationObject;
  evidence: Evidence[];
  segments: SourceSegment[];
  exercises: ExerciseSet | null;
  assets?: Record<string, AssetView>;
  modeLabel: string | null;
  status?: React.ReactNode;
  canReformulate: boolean;
  isDemo?: boolean;
  /** Titre de chaque document (Limpid commun) : les références nomment leur document. */
  documents?: Record<string, string>;
}): LimpidDoc {
  const { numbers, entries } = sourceEntries(blueprint, evidence, segments, documents);
  const notions = buildNotions(explanation, numbers);
  const termList = notions.map((n) => n.term);
  const ctx: Ctx = { t, numbers, terms: { matcher: termMatcher(termList), list: termList, used: new Set() } };
  const sections = new Map(explanation.sections.map((s) => [s.id, s]));
  const visuals = new Map(blueprint.visual_specs.map((v) => [v.id, v]));
  const checkpoints = new Map((exercises?.checkpoints ?? []).map((c) => [c.section_id, c.exercises]));
  const ordered = blueprint.sections.flatMap((bs) => {
    const s = sections.get(bs.section_id);
    return s ? [{ s, bs }] : [];
  });
  const chapters = ordered.map(({ s }) => ({ id: s.id, title: s.question }));
  const keyPoints = explanation.key_points?.length ? explanation.key_points : explanation.sections.slice(0, 5).map((s) => s.takeaway);
  const showIllustrations = true;

  const out: React.ReactNode[] = [];
  out.push(
    // Couverture puis points clés, en pièces distinctes : ce qui ne tient pas dans l'écran
    // passe à la vue suivante au lieu d'être coupé.
    // V5 : titre compact (aucune couverture plein écran), immédiatement suivi du résumé.
    <header key="head" id="lim_cover" className="piece lim-head" {...attrs({})}>
      <p className="eyebrow lim-head-eyebrow">
        {isDemo && <span className="badge badge-demo">{t.demo.badge}</span>} {modeLabel ? `${modeLabel} · ` : ""}{t.reader.eyebrow(chapters.length, notions.length)}
      </p>
      <h1 className="lim-head-title">{blueprint.title}</h1>
      {status}
    </header>,
    <section key="keypoints" id="lim_keypoints" className="piece keypoints" aria-labelledby="kp-h" {...attrs({})}>
      <h2 id="kp-h" className="keypoints-title">{t.lim.keyPoints}</h2>
      <ul>{keyPoints.map((k, i) => <li key={i}><Rich text={k} ctx={ctx} linkTerms={false} /></li>)}</ul>
      {explanation.short_result && <p className="notice short-result" role="note">{t.lim.shortResult}</p>}
    </section>,
  );

  ordered.forEach(({ s, bs }, si) => {
    const placed = bs.visual_ids.flatMap((id) => (visuals.get(id) ? [visuals.get(id)!] : []));
    out.push(
      <div key={`h-${s.id}`} id={s.id} className="piece section-head" {...attrs({ keep: true, section: s.id })}>
        <p className="eyebrow section-n">{t.lim.chapterLabel(si + 1)}</p>
        <h2>{s.question}</h2>
      </div>,
    );
    // V6 : « L'essentiel » du chapitre, en tête du corps (une fois par chapitre).
    if (s.essential?.length) {
      out.push(
        <aside key={`ess-${s.id}`} id={`ess_${s.id}`} className="piece v6-essential" aria-label={t.blocks6.essential} {...attrs({ section: s.id })}>
          <Essential title={t.blocks6.essential} items={s.essential.map((e, i) => <Rich key={i} text={e} ctx={ctx} linkTerms={false} />)} />
        </aside>,
      );
    }
    // V5 : une figure prend toute la largeur, après l'explication qu'elle accompagne (jamais
    // de texte qui l'entoure sur mobile). Illustration après le premier bloc, données ensuite.
    const illustrations = placed.filter((v) => v.kind === "illustration");
    const others = placed.filter((v) => v.kind !== "illustration" && v.kind !== "drawing");
    s.blocks.forEach((b, bi) => {
      out.push(...blockPieces(b, s.id, ctx));
      if (bi === 0) for (const v of illustrations) out.push(visualPiece(v, s.id, ctx, assets, showIllustrations));
    });
    for (const v of others) out.push(visualPiece(v, s.id, ctx, assets, showIllustrations));
    if (s.retain?.length) {
      out.push(
        <aside key={`ret-${s.id}`} id={`ret_${s.id}`} className="piece retain" aria-label={t.lim.retain} {...attrs({ section: s.id })}>
          <p className="retain-title">{t.lim.retain}</p>
          <ul>{s.retain.map((r, i) => <li key={i}><Rich text={r} ctx={ctx} linkTerms={false} /></li>)}</ul>
        </aside>,
      );
    }
    const ckp = checkpoints.get(s.id);
    if (ckp?.length) {
      out.push(
        <div key={`ckp-${s.id}`} id={`ckp_${s.id}`} className="piece piece-checkpoint" {...attrs({ section: s.id })}>
          <ChapterCheck id={`ckp_${s.id}`} sectionId={s.id} title={s.question} exercises={ckp} />
        </div>,
      );
    }
  });

  out.push(
    <section key="end" id="end_bilan" className="piece end" aria-labelledby="end-h" {...attrs({ breakBefore: true })}>
      <p className="eyebrow">{t.lim.endTitle}</p>
      <h2 id="end-h" className="end-title">{blueprint.title}</h2>
      <EndActions canReformulate={canReformulate} />
    </section>,
    <div key="end-annexes" id="end_more" className="piece" {...attrs({})}>
      <AnnexLinks />
    </div>,
  );

  // Annexes (glossaire, sources, limites) : page continue à part, hors du carrousel (§ 14).

  return { chapters, notions, entries, pieces: out };
}
