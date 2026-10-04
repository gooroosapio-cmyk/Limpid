import type { VisualSpec } from "@/lib/contracts/schemas";
import { fr } from "@/lib/i18n/fr";
import { barRatios, ChartData, ComparisonData, FlowData, IllustrationData, safeHref, type AssetView } from "@/lib/render/visuals";

export type { AssetView };
import { FlowDiagram } from "./FlowDiagram";

function BarChart({ data, labelledBy }: { data: ChartData; labelledBy: string }) {
  const row = 44;
  const labelW = 110;
  const barW = 150;
  const ratios = barRatios(data.bars.map((b) => b.value));
  const height = data.bars.length * row;
  return (
    <svg viewBox={`0 0 320 ${height}`} role="img" aria-labelledby={labelledBy}>
      {data.bars.map((b, i) => {
        const y = i * row;
        const w = Math.max(2, Math.round(ratios[i]! * barW));
        return (
          <g key={b.claim_id + i}>
            <text x={labelW - 8} y={y + 26} textAnchor="end" fontSize="14" className="chart-label">{b.label}</text>
            <rect x={labelW} y={y + 10} width={w} height={22} rx="4" className="chart-bar" />
            <text x={labelW + w + 6} y={y + 26} fontSize="14" fontWeight="600" className="chart-label">{b.source_form}</text>
          </g>
        );
      })}
    </svg>
  );
}

function ComparisonTable({ data, caption }: { data: ComparisonData; caption: React.ReactNode }) {
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
                return <td key={c}>{cell?.text ?? <span className="muted">{fr.visuals.notStated}</span>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Credit({ asset }: { asset: AssetView }) {
  if (asset.provider === "gemini") return <span className="credit">{fr.visuals.generated(asset.model)}</span>;
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
  const altId = `${v.id}-alt`;
  const alternative = (
    <details>
      <summary>{fr.reader.textAlternative}</summary>
      <p id={altId}>{v.alt_text}</p>
    </details>
  );
  switch (v.kind) {
    case "flow": {
      const d = FlowData.safeParse(v.data);
      if (!d.success) return null;
      return (
        <figure className="visual">
          <FlowDiagram data={d.data} labelledBy={altId} />
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
            <span className="eyebrow">{fr.visuals.illustration}</span> {v.caption}
            <br />
            <Credit asset={asset} />
          </figcaption>
        </figure>
      );
    }
    default:
      return null;
  }
}
