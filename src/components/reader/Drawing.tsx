import { arrowHead, DRAW_RATIOS, type DrawingData } from "@/lib/render/visuals";

/**
 * Dessin pédagogique : SVG construit par le moteur à partir de formes validées, sans fond,
 * couleurs du thème (classes CSS), épaisseur de trait constante quelle que soit la taille.
 */
export function DrawingSvg({ data, label }: { data: DrawingData; label: string }) {
  const [W, H] = DRAW_RATIOS[data.ratio];
  return (
    <svg className="drawing" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      {data.shapes.map((s, i) => {
        const cls = `dr dr-${s.tone}${s.fill ? " dr-fill" : ""}`;
        switch (s.t) {
          case "circle":
            return <circle key={i} className={cls} cx={s.x} cy={s.y} r={s.r ?? 0} />;
          case "ellipse":
            return <ellipse key={i} className={cls} cx={s.x} cy={s.y} rx={(s.w ?? 0) / 2} ry={(s.h ?? 0) / 2} />;
          case "rect":
            return <rect key={i} className={cls} x={s.x} y={s.y} width={s.w ?? 0} height={s.h ?? 0} rx={s.r ?? 0} />;
          case "line":
            return <line key={i} className={`dr dr-${s.tone}`} x1={s.x} y1={s.y} x2={s.x2 ?? s.x} y2={s.y2 ?? s.y} />;
          case "arrow":
            return (
              <g key={i}>
                <line className={`dr dr-${s.tone}`} x1={s.x} y1={s.y} x2={s.x2 ?? s.x} y2={s.y2 ?? s.y} />
                <polygon className={`dr dr-${s.tone} dr-fill`} points={arrowHead(s.x, s.y, s.x2 ?? s.x, s.y2 ?? s.y)} />
              </g>
            );
          case "path":
            return <path key={i} className={cls} d={s.d ?? ""} />;
          case "text":
            return (
              <text key={i} className={`dr-text dr-t-${s.tone}`} x={s.x} y={s.y} textAnchor="middle" dominantBaseline="middle">
                {s.text}
              </text>
            );
        }
      })}
    </svg>
  );
}
