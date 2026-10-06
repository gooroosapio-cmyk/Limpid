"use client";

import type { VisualSpec } from "@/lib/contracts/schemas";
import { useT } from "@/lib/i18n/client";
import { barRatios, ChartData, ComparisonData, DrawingData, FlowData, IllustrationData, safeHref, type AssetView } from "@/lib/render/visuals";
import { fitLabel } from "@/lib/render/wrap";
import { DrawingSvg } from "./Drawing";

export type { AssetView };
import { FlowDiagram } from "./FlowDiagram";

/**
 * Barres horizontales lisibles à 320 px : libellé au-dessus de sa barre, valeur (forme du
 * document) à côté ; libellés et valeurs coupés sur plusieurs lignes, jamais hors du cadre.
 */
function BarChart({ data, labelledBy }: { data: ChartData; labelledBy: string }) {
  const width = 320;
  const barMax = 190;
  const ratios = barRatios(data.bars.map((b) => b.value));
  const rows = data.bars.map((b, i) => {
    const w = Math.max(2, Math.round(ratios[i]! * barMax));
    const label = fitLabel(b.label, width - 4, [14, 13], 2);
    const value = fitLabel(b.source_form, width - w - 10, [14, 12], 4);
    const labelH = label.lines.length * Math.round(label.size * 1.25);
    const valueH = value.lines.length * Math.round(value.size * 1.2);
    return { b, w, label, value, labelH, valueH, h: labelH + Math.max(26, valueH + 6) + 14 };
  });
  const height = rows.reduce((sum, r) => sum + r.h, 0);
  // Haut de chaque ligne : somme des hauteurs précédentes (calculée avant le rendu).
  const tops = rows.map((_, i) => rows.slice(0, i).reduce((sum, r) => sum + r.h, 0));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={labelledBy}>
      {rows.map((r, i) => {
        const top = tops[i]!;
        const lh = Math.round(r.label.size * 1.25);
        const vh = Math.round(r.value.size * 1.2);
        const barY = top + r.labelH + 4;
        return (
          <g key={r.b.claim_id + i}>
            <text x={0} y={top + lh * 0.8} fontSize={r.label.size} className="chart-label">
              {r.label.lines.map((l, k) => <tspan key={k} x={0} dy={k === 0 ? 0 : lh}>{l}</tspan>)}
            </text>
            <rect x={0} y={barY} width={r.w} height={22} rx="4" className="chart-bar" />
            <text x={r.w + 6} y={barY + 16} fontSize={r.value.size} fontWeight="600" className="chart-label">
              {r.value.lines.map((l, k) => <tspan key={k} x={r.w + 6} dy={k === 0 ? 0 : vh}>{l}</tspan>)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ComparisonTable({ data, caption }: { data: ComparisonData; caption: React.ReactNode }) {
  const t = useT();
  return (
    <div className="table-scroll">
      <table className="compare">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <td />
            {data.criteria.map((c) => <th key={c} scope="col">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.options.map((o) => (
            <tr key={o.name}>
              <th scope="row">{o.name}</th>
              {data.criteria.map((c, i) => {
                const cell = o.cells[i];
                return <td key={c}>{cell?.text ?? <span className="muted">{t.visuals.notStated}</span>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Credit({ asset }: { asset: AssetView }) {
  const t = useT();
  if (asset.provider === "gemini" || asset.provider === "recraft") return <span className="credit">{t.visuals.generated}</span>;
  const via = asset.provider === "commons" ? "Wikimedia Commons" : "Unsplash";
  const licenseUrl = safeHref(asset.licenseUrl);
  const sourceUrl = safeHref(asset.sourceUrl);
  return (
    <span className="credit">
      {asset.author ? `${asset.author} · ` : ""}
      {asset.license && licenseUrl ? (
        <a href={licenseUrl} rel="noopener noreferrer nofollow" target="_blank">{asset.license}</a>
      ) : (
        asset.license
      )}
      {asset.license ? " · " : ""}
      {sourceUrl ? (
        <a href={sourceUrl} rel="noopener noreferrer nofollow" target="_blank">{via}</a>
      ) : (
        via
      )}
      {asset.modifications ? ` · ${asset.modifications}` : ""}
    </span>
  );
}

/**
 * Un visuel du plan de rapport. Données revalidées par type ; un visuel invalide ou une
 * illustration sans actif n'est pas affiché (le texte porte toujours les faits).
 */
export function VisualFigure({
  visual: v,
  refs,
  asset,
  showIllustrations,
}: {
  visual: VisualSpec;
  refs: React.ReactNode;
  asset?: AssetView;
  showIllustrations: boolean;
}) {
  const t = useT();
  const altId = `${v.id}-alt`;
  const alternative = (
    <details>
      <summary>{t.reader.textAlternative}</summary>
      <p id={altId}>{v.alt_text}</p>
    </details>
  );
  switch (v.kind) {
    case "flow": {
      const d = FlowData.safeParse(v.data);
      if (!d.success) return null;
      return (
        <figure className="visual">
          <FlowDiagram data={d.data} labelledBy={altId} cycleLabel={t.pdf.cycle.replace(/^↺\s*/, "… ")} />
          <figcaption>{v.caption} {refs}</figcaption>
          {alternative}
        </figure>
      );
    }
    case "bar_chart": {
      const d = ChartData.safeParse(v.data);
      if (!d.success) return null;
      return (
        <figure className="visual">
          <BarChart data={d.data} labelledBy={altId} />
          <figcaption>{v.caption}{d.data.unit ? ` (${d.data.unit})` : ""} {refs}</figcaption>
          {alternative}
        </figure>
      );
    }
    case "comparison_table": {
      const d = ComparisonData.safeParse(v.data);
      if (!d.success) return null;
      return (
        <figure className="visual visual-table">
          <ComparisonTable data={d.data} caption={<>{v.caption} {refs}</>} />
        </figure>
      );
    }
    case "illustration": {
      const d = IllustrationData.safeParse(v.data);
      if (!showIllustrations || !d.success || !asset) return null;
      return (
        <figure className="visual illustration">
          {/* Actif vérifié (type, taille, dimensions) et servi par Limpid ou l'hébergeur autorisé. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset.src} alt={v.alt_text} width={asset.width} height={asset.height} loading="lazy" decoding="async" />
          <figcaption>
            <span className="eyebrow">{t.visuals.illustration}</span> {v.caption}
            <br />
            <Credit asset={asset} />
          </figcaption>
        </figure>
      );
    }
    case "drawing": {
      const d = DrawingData.safeParse(v.data);
      if (!d.success) return null;
      return (
        <figure className="visual visual-drawing">
          <DrawingSvg data={d.data} label={v.alt_text} />
          <figcaption><span className="eyebrow">{t.visuals.illustration}</span> {v.caption}</figcaption>
        </figure>
      );
    }
    default:
      return null;
  }
}

/** Visuel incrusté dans un bloc : le texte l'entoure puis continue sous son pied. */
export function WrapFigure({ visual: v, asset, side }: { visual: VisualSpec; asset?: AssetView; side: "left" | "right" }) {
  const cls = `wrap-fig wrap-${side} wrap-${v.size ?? "thumb"}`;
  if (v.kind === "drawing") {
    const d = DrawingData.safeParse(v.data);
    if (!d.success) return null;
    return (
      <figure className={`${cls} wrap-ratio-${d.data.ratio.replace(":", "-")}`}>
        <DrawingSvg data={d.data} label={v.alt_text} />
        <figcaption>{v.caption}</figcaption>
      </figure>
    );
  }
  if (v.kind === "illustration" && asset) {
    return (
      <figure className={cls}>
        {/* Actif vérifié (type, taille, dimensions) et servi par Limpid ou l'hébergeur autorisé. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.src} alt={v.alt_text} width={asset.width} height={asset.height} loading="lazy" decoding="async" />
        <figcaption>
          {v.caption}
          <span className="credit"> · <Credit asset={asset} /></span>
        </figcaption>
      </figure>
    );
  }
  return null;
}
