"use client";

import { useId, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { formatNumber, proportionParts } from "@/lib/render/calc";

/**
 * Part d'un tout (kit V6) : total, pourcentage, part et reste calculés par le code, barre
 * proportionnelle en SVG (aucun style en ligne). Si `interactive` : curseur, − / + et
 * « Réinitialiser » en état local ; la valeur de référence reste toujours affichée.
 */
export function Proportion({
  base,
  percent,
  unit,
  partLabel,
  restLabel,
  interactive,
  example,
  intro,
  refs,
}: {
  base: number;
  percent: number;
  unit: string;
  partLabel: string;
  restLabel: string;
  interactive: boolean;
  example: boolean;
  intro: React.ReactNode;
  refs: React.ReactNode;
}) {
  const t = useT().blocks6;
  const uid = useId();
  const [value, setValue] = useState(percent);
  const f = (n: number) => formatNumber(n, t.locale);
  const u = (n: number) => (unit ? `${f(n)} ${unit}` : f(n));
  const cur = proportionParts(base, value);
  const ref = proportionParts(base, percent);
  const changed = cur.percent !== ref.percent;
  const set = (v: number) => setValue(Math.min(100, Math.max(0, Math.round(v * 100) / 100)));
  const restPct = 100 - cur.percent;

  return (
    <div className="v6-card v6-proportion">
      {example && <span className="v6-pill">{t.example}</span>}
      <p className="v6-intro">{intro} {refs}</p>
      <p className="v6-line">
        {t.total} : <strong>{u(base)}</strong>
      </p>
      {interactive ? (
        <div className="v6-controls">
          <label htmlFor={`${uid}-range`} className="v6-line">
            {t.percent} : <strong>{f(cur.percent)} %</strong>
          </label>
          <input
            id={`${uid}-range`}
            className="v6-range"
            type="range"
            min={0}
            max={100}
            step={1}
            value={cur.percent}
            aria-valuetext={`${f(cur.percent)} %`}
            onChange={(e) => set(Number(e.target.value))}
          />
          <div className="v6-buttons">
            <button type="button" className="v6-btn v6-btn-icon" aria-label={t.decrease} disabled={cur.percent <= 0} onClick={() => set(cur.percent - 1)}>
              −
            </button>
            <button type="button" className="v6-btn v6-btn-icon" aria-label={t.increase} disabled={cur.percent >= 100} onClick={() => set(cur.percent + 1)}>
              +
            </button>
            <button type="button" className="v6-btn" disabled={!changed} onClick={() => setValue(percent)}>
              {t.reset}
            </button>
          </div>
        </div>
      ) : (
        <p className="v6-line">
          {t.percent} : <strong>{f(cur.percent)} %</strong>
        </p>
      )}
      <svg className="v6-split" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label={t.proportionAria(partLabel, f(cur.percent), restLabel, f(restPct))}>
        <rect className="v6-split-rest" x={0} y={0} width={100} height={10} rx={1.2} />
        {cur.percent > 0 && <rect className="v6-split-part" x={0} y={0} width={cur.percent} height={10} rx={1.2} />}
        {cur.percent > 0 && cur.percent < 100 && <rect className="v6-split-gap" x={cur.percent - 0.4} y={0} width={0.8} height={10} />}
      </svg>
      <div className="v6-results" aria-live="polite">
        <div className="v6-result">
          <span className="v6-result-label"><span className="v6-swatch v6-swatch-part" aria-hidden="true" />{partLabel}</span>
          <strong className="v6-result-value">{u(cur.part)}</strong>
          <span className="v6-result-sub">{f(cur.percent)} %</span>
        </div>
        <div className="v6-result">
          <span className="v6-result-label"><span className="v6-swatch v6-swatch-rest" aria-hidden="true" />{restLabel}</span>
          <strong className="v6-result-value">{u(cur.rest)}</strong>
          <span className="v6-result-sub">{f(restPct)} %</span>
        </div>
      </div>
      <p className="v6-mono">
        {f(base)} × {f(cur.percent)} / 100 = {f(cur.part)}
      </p>
      <div className={`v6-status${changed ? " is-sim" : ""}`} role="status">
        {changed && <p className="v6-status-title">{t.simulation}</p>}
        <p className="v6-status-ref">
          {t.reference} : {f(ref.percent)} % · {partLabel} {u(ref.part)} · {restLabel} {u(ref.rest)}
        </p>
      </div>
    </div>
  );
}
