import type { FlowData } from "@/lib/render/visuals";

/** Schéma de flux vertical, lisible à 360 px. Les libellés sont du texte (sélectionnable, échappé). */
export function FlowDiagram({ data, labelledBy }: { data: FlowData; labelledBy: string }) {
  const boxH = 48;
  const gap = 36;
  const width = 300;
  const n = data.steps.length;
  const height = n * boxH + (n - 1) * gap + (data.cyclic ? 40 : 0);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={labelledBy}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" className="flow-arrow" />
        </marker>
      </defs>
      {data.steps.map((s, i) => {
        const y = i * (boxH + gap);
        return (
          <g key={s.claim_id + i}>
            <rect x="40" y={y} width={width - 80} height={boxH} rx="10" className={i === 0 ? "flow-box flow-box-first" : "flow-box"} strokeWidth="1.5" />
            <text x={width / 2} y={y + boxH / 2 + 6} textAnchor="middle" fontSize="17" fontWeight="600" className="flow-text">
              {i + 1}. {s.label}
            </text>
            {i < n - 1 && (
              <line x1={width / 2} y1={y + boxH + 4} x2={width / 2} y2={y + boxH + gap - 6} className="flow-line" strokeWidth="1.8" markerEnd="url(#arrow)" />
            )}
          </g>
        );
      })}
      {data.cyclic && (
        <path
          d={`M${width - 40} ${(n - 1) * (boxH + gap) + boxH / 2} H${width - 12} V${boxH / 2} H${width - 36}`}
          className="flow-cycle"
          strokeWidth="1.8"
          strokeDasharray="5 4"
          markerEnd="url(#arrow)"
        />
      )}
      {data.cyclic && (
        <text x={width / 2} y={height - 8} textAnchor="middle" fontSize="14" className="flow-cycle-text">
          … puis le cycle recommence
        </text>
      )}
    </svg>
  );
}
