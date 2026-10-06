"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { formatNumber } from "@/lib/render/calc";
import { barPath, fitAxisLabel, FRAME, linePath, round, slots, yScale } from "@/lib/render/chart6";
import { Missing } from "./Missing";

interface Point {
  label: string;
  value: number | null;
}

/**
 * Graphique du lecteur V6 dessiné par le code : barres (ligne de base à zéro, négatives sous la
 * base, ordre d'origine) ou courbe (interrompue à chaque valeur absente). Chaque valeur se
 * sélectionne au toucher ou au clavier ; un tableau équivalent donne toutes les valeurs exactes.
 */
export function Chart({ chartType, unit, points, intro, refs }: { chartType: "bar" | "line"; unit: string; points: Point[]; intro: React.ReactNode; refs: React.ReactNode }) {
  const t = useT().blocks6;
  const [selected, setSelected] = useState<number | null>(null);
  const f = (n: number) => formatNumber(n, t.locale);
  const u = (n: number) => (unit ? `${f(n)} ${unit}` : f(n));
  const values = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  const table = (
    <details className="v6-chart-table">
      <summary>{t.showValues}</summary>
      <div className="v6-table-wrap">
        <table className="v6-table">
          <thead>
            <tr>
              <th scope="col">{t.itemCol}</th>
              <th scope="col">{unit ? `${t.valueCol} (${unit})` : t.valueCol}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={i}>
                <th scope="row">{p.label}</th>
                <td className="v6-num">{p.value === null ? <Missing label={t.missing} /> : f(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );

  if (!values.length) {
    return (
      <div className="v6-card v6-chart">
        <p className="v6-intro">{intro} {refs}</p>
        <p className="v6-note">{t.noData}</p>
        {table}
      </div>
    );
  }

  const F = FRAME;
  const scale = yScale(values);
  const { x, step } = slots(points.length);
  const base = scale.y(0);
  const barW = Math.min(24, step * 0.6);
  const toggle = (i: number) => setSelected((s) => (s === i ? null : i));
  const sel = selected !== null ? points[selected] : undefined;
  const line = chartType === "line" ? linePath(points.map((p, i) => ({ x: x(i), y: p.value === null ? null : scale.y(p.value) }))) : "";

  return (
    <div className="v6-card v6-chart">
      <p className="v6-intro">{intro} {refs}</p>
      <svg className="v6-chart-svg" viewBox={`0 0 ${F.width} ${F.height}`} role="group" aria-label={t.chartAria(values.length, unit)}>
        {scale.ticks.map((v) => (
          <g key={v} aria-hidden="true">
            <line className={v === 0 ? "v6-axis-zero" : "v6-grid"} x1={F.left} x2={F.width - F.right} y1={round(scale.y(v))} y2={round(scale.y(v))} />
            <text className="v6-tick" x={F.left - 6} y={round(scale.y(v)) + 4} textAnchor="end">
              {f(v)}
            </text>
          </g>
        ))}
        {line && <path className="v6-line-path" d={line} aria-hidden="true" />}
        {points.map((p, i) => {
          const cx = round(x(i));
          const label = (
            <text className="v6-xlabel" x={cx} y={F.height - F.bottom + 18} textAnchor="middle" aria-hidden="true">
              {fitAxisLabel(p.label, step - 4)}
            </text>
          );
          if (p.value === null) {
            return (
              <g key={i}>
                <text className="v6-missing-mark" x={cx} y={round(base) - 6} textAnchor="middle" aria-hidden="true">
                  —
                </text>
                {label}
              </g>
            );
          }
          const cy = round(scale.y(p.value));
          const isSel = selected === i;
          const name = t.pointLabel(p.label, u(p.value));
          return (
            <g
              key={i}
              className={`v6-datum${isSel ? " is-selected" : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={isSel}
              aria-label={name}
              onClick={() => toggle(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(i);
                }
              }}
            >
              <title>{name}</title>
              {/* Zone de toucher plus large que la marque. */}
              <rect className="v6-hit" x={round(cx - step / 2)} y={F.top} width={round(step)} height={F.height - F.top - F.bottom} />
              {chartType === "bar" ? (
                <path className="v6-bar" d={barPath(cx, barW, round(base), cy)} />
              ) : (
                <circle className="v6-dot" cx={cx} cy={cy} r={isSel ? 6 : 4.5} />
              )}
              {isSel && (
                <text className="v6-value-label" x={cx} y={p.value >= 0 ? cy - 9 : cy + 17} textAnchor="middle">
                  {f(p.value)}
                </text>
              )}
              {label}
            </g>
          );
        })}
      </svg>
      <p className="v6-chart-readout" aria-live="polite">
        {sel && sel.value !== null ? <strong>{t.pointLabel(sel.label, u(sel.value))}</strong> : t.chartHint}
      </p>
      {table}
    </div>
  );
}
