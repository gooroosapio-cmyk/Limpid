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
import { VisualFigure, WrapFigure, type AssetView } from "../Visuals";
import { Checkpoint } from "./Checkpoint";
import { EndActions } from "./EndActions";
import { ExampleBlock } from "./ExampleBlock";

/** Taille des groupes des longues listes (une pièce = un groupe insécable). */
const CHUNK = 5;

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
    <header key="cover" id="lim_cover" className="piece cover" {...attrs({ breakAfter: true })}>
      <p className="eyebrow cover-eyebrow">
        {isDemo && <span className="badge badge-demo">{t.demo.badge}</span>} {modeLabel ? `${modeLabel} · ` : ""}{t.reader.eyebrow(chapters.length, notions.length)}
      </p>
      <h1 className="cover-title">{blueprint.title}</h1>
      {status}
      <section className="keypoints" aria-labelledby="kp-h">
        <h2 id="kp-h" className="keypoints-title">{t.lim.keyPoints}</h2>
        <ul>{keyPoints.map((k, i) => <li key={i}><Rich text={k} ctx={ctx} linkTerms={false} /></li>)}</ul>
      </section>
      {explanation.short_result && <p className="notice short-result" role="note">{t.lim.shortResult}</p>}
    </header>,
  );

  let wrapCount = 0;
  ordered.forEach(({ s, bs }, si) => {
    const placed = bs.visual_ids.flatMap((id) => (visuals.get(id) ? [visuals.get(id)!] : []));
    const where = (v: VisualSpec) => v.placement ?? (v.kind === "illustration" ? "before" : "after");
    out.push(
      <div key={`h-${s.id}`} id={s.id} className="piece section-head" {...attrs({ keep: true, section: s.id })}>
        <p className="eyebrow section-n">{si + 1} / {ordered.length}</p>
        <h2>{s.question}</h2>
      </div>,
    );
    for (const v of placed.filter((v) => where(v) === "before")) out.push(visualPiece(v, s.id, ctx, assets, showIllustrations));
    const margins = placed.filter((v) => where(v) === "margin");
    // Incrustations : chaque visuel « wrap » rejoint un bloc de texte de la partie (celui que
    // vise le dessin, sinon le plus long), côtés alternés ; sans bloc adapté, il suit la partie.
    const floats = new Map<string, React.ReactNode>();
    const unplaced: VisualSpec[] = [];
    for (const v of placed.filter((x) => where(x) === "wrap")) {
      const asset = v.kind === "illustration" ? assets[String((v.data as { asset_id?: unknown }).asset_id ?? "")] : undefined;
      if (v.kind === "illustration" && !asset) continue;
      const wanted = String((v.data as { block_id?: unknown }).block_id ?? "");
      const textual = s.blocks.filter((b) => !floats.has(b.id) && ["fact", "definition", "inference", "caution", "list", "complement"].includes(b.type));
      const anchor = textual.find((b) => b.id === wanted) ?? [...textual].sort((a, c) => c.text.length - a.text.length).find((b) => b.text.length >= 140);
      if (!anchor) {
        unplaced.push(v);
        continue;
      }
      floats.set(anchor.id, <WrapFigure key={v.id} visual={v} asset={asset} side={wrapCount++ % 2 === 0 ? "right" : "left"} />);
    }
    s.blocks.forEach((b, bi) => {
      const pieces = blockPieces(b, s.id, ctx, floats.get(b.id));
      const margin = bi === 0 ? margins.shift() : undefined;
      // Visuel « en marge » : associé au premier bloc (côte à côte sur grand écran, empilé sur mobile).
      if (margin && pieces.length === 1) {
        const paired = visualPiece(margin, s.id, ctx, assets, showIllustrations, pieces[0]);
        out.push(paired ?? pieces[0]);
      } else {
        if (margin) margins.unshift(margin);
        out.push(...pieces);
      }
    });
    for (const v of [...placed.filter((v) => where(v) === "after" || where(v) === "center"), ...margins, ...unplaced]) {
      out.push(visualPiece(v, s.id, ctx, assets, showIllustrations));
    }
    const ckp = checkpoints.get(s.id);
    if (ckp?.length) {
      out.push(
        <div key={`ckp-${s.id}`} id={`ckp_${s.id}`} className="piece piece-checkpoint" {...attrs({ section: s.id, breakBefore: true, breakAfter: true })}>
          <Checkpoint id={`ckp_${s.id}`} sectionId={s.id} exercises={ckp} />
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
  );

  // Annexes (glossaire, sources, limites) : page continue à part, hors du carrousel (§ 14).

  return { chapters, notions, entries, pieces: out };
}
