import { fitLabel } from "@/lib/render/wrap";
import type { FlowData } from "@/lib/render/visuals";

/**
 * Schéma de flux vertical, lisible à 360 px. Les libellés sont du texte (sélectionnable,
 * échappé), coupés sur plusieurs lignes selon leur largeur estimée : la boîte grandit avec
 * eux, rien ne déborde ni n'est tronqué.
 */
export function FlowDiagram({ data, labelledBy, cycleLabel }: { data: FlowData; labelledBy: string; cycleLabel: string }) {
  const gap = 36;
  const width = 300;
  const boxW = width - 80;
  const padY = 12;
  const n = data.steps.length;
  const boxes = data.steps.map((s, i) => {
    const fit = fitLabel(`${i + 1}. ${s.label}`, boxW - 24);
    const lineH = Math.round(fit.size * 1.25);
    return { ...fit, lineH, h: Math.max(48, fit.lines.length * lineH + padY * 2) };
  });
  const tops: number[] = [];
  let y = 0;
  for (const b of boxes) {
    tops.push(y);
    y += b.h + gap;
  }
  const bottom = y - gap;
  const height = bottom + (data.cyclic ? 40 : 0);
  const last = boxes.length - 1;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={labelledBy}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" className="flow-arrow" />
        </marker>
      </defs>
      {data.steps.map((s, i) => {
        const b = boxes[i]!;
        const top = tops[i]!;
        const first = top + (b.h - b.lines.length * b.lineH) / 2 + b.lineH * 0.78;
        return (
          <g key={s.claim_id + i}>
            <rect x="40" y={top} width={boxW} height={b.h} rx="10" className={i === 0 ? "flow-box flow-box-first" : "flow-box"} strokeWidth="1.5" />
            <text x={width / 2} y={first} textAnchor="middle" fontSize={b.size} fontWeight="600" className="flow-text">
              {b.lines.map((l, k) => (
                <tspan key={k} x={width / 2} dy={k === 0 ? 0 : b.lineH}>{l}</tspan>
              ))}
            </text>
            {i < n - 1 && (
              <line x1={width / 2} y1={top + b.h + 4} x2={width / 2} y2={top + b.h + gap - 6} className="flow-line" strokeWidth="1.8" markerEnd="url(#arrow)" />
            )}
          </g>
        );
      })}
      {data.cyclic && last >= 0 && (
        <path
          d={`M${width - 40} ${tops[last]! + boxes[last]!.h / 2} H${width - 12} V${boxes[0]!.h / 2} H${width - 36}`}
          className="flow-cycle"
          strokeWidth="1.8"
          strokeDasharray="5 4"
          markerEnd="url(#arrow)"
        />
      )}
      {data.cyclic && (
        <text x={width / 2} y={height - 8} textAnchor="middle" fontSize="14" className="flow-cycle-text">
          {cycleLabel}
        </text>
      )}
    </svg>
  );
}
