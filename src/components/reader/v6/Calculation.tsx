"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";
import { computeCalculation, formatNumber, formulaText, inDomain, resultUnit, variableDomain, type FormulaId } from "@/lib/render/calc";

interface Variable {
  label: string;
  value: number;
  unit: string;
}

const parse = (raw: string) => (raw.trim() === "" ? Number.NaN : Number(raw.replace(",", ".")));

/**
 * Calcul manipulable (kit V6) : une des cinq opérations fixes, calculée par le code (jamais
 * d'évaluation d'expression). Si `interactive`, les deux valeurs sont modifiables (état local,
 * contrôle du domaine) ; la formule de référence, ses étapes et son résultat restent visibles.
 */
export function Calculation({
  formula,
  variables,
  steps,
  interactive,
  example,
  intro,
  refs,
}: {
  formula: FormulaId;
  variables: [Variable, Variable];
  steps: string[];
  interactive: boolean;
  example: boolean;
  intro: React.ReactNode;
  refs: React.ReactNode;
}) {
  const t = useT().blocks6;
  const uid = useId();
  const initial = variables.map((v) => String(v.value));
  const [raw, setRaw] = useState<string[]>(initial);
  const f = (n: number) => formatNumber(n, t.locale);
  const [va, vb] = variables;
  const unit = resultUnit(formula, va.unit, vb.unit);
  const withUnit = (n: number) => (unit.unit ? `${f(n)} ${unit.unit === "%" ? "%" : unit.unit}` : f(n));

  const refResult = computeCalculation(formula, va.value, vb.value);
  const values = raw.map(parse);
  const errors = values.map((v, i) => {
    if (!Number.isFinite(v)) return t.notANumber;
    if (!inDomain(formula, i, v)) {
      const d = variableDomain(formula, i);
      return t.outOfDomain(f(d.min ?? Number.NEGATIVE_INFINITY), f(d.max ?? Number.POSITIVE_INFINITY));
    }
    return null;
  });
  const valid = errors.every((e) => e === null);
  const a = values[0]!;
  const b = values[1]!;
  const result = valid ? computeCalculation(formula, a, b) : null;
  const why = !valid ? null : result !== null ? null : formula === "ratio" ? t.divisionByZero : formula === "percent_change" ? t.zeroBase : null;
  const changed = raw.some((r, i) => parse(r) !== variables[i]!.value);
  const note = unit.kind === "points" ? t.points : unit.kind === "percent" ? t.percentChange : null;

  return (
    <div className="v6-card v6-calc">
      <div className="v6-card-head">
        <span className="block-label"><Icon name="formula" size={14} />{t.formulas[formula]}</span>
        {example && <span className="v6-pill">{t.example}</span>}
      </div>
      <p className="v6-intro">{intro} {refs}</p>
      {interactive ? (
        <div className="v6-fields">
          {variables.map((v, i) => {
            const d = variableDomain(formula, i);
            const err = errors[i];
            return (
              <div key={i} className="v6-field">
                <label htmlFor={`${uid}-v${i}`}>
                  {v.label}
                  {v.unit && <span className="v6-unit"> ({v.unit})</span>}
                </label>
                <input
                  id={`${uid}-v${i}`}
                  className="v6-input"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={d.min}
                  max={d.max}
                  value={raw[i]}
                  aria-invalid={err ? true : undefined}
                  aria-describedby={err ? `${uid}-e${i}` : undefined}
                  onChange={(e) => setRaw((r) => r.map((x, k) => (k === i ? e.target.value : x)))}
                />
                {err && (
                  <p id={`${uid}-e${i}`} className="v6-error">
                    {err}
                  </p>
                )}
              </div>
            );
          })}
          <button type="button" className="v6-btn" disabled={!changed} onClick={() => setRaw(initial)}>
            {t.reset}
          </button>
        </div>
      ) : (
        <dl className="v6-vars">
          {variables.map((v, i) => (
            <div key={i}>
              <dt>{v.label}</dt>
              <dd>{v.unit ? `${f(v.value)} ${v.unit}` : f(v.value)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="v6-calc-result" aria-live="polite">
        <span className="v6-result-label">{t.result}</span>
        {result !== null ? (
          <p className="v6-mono v6-calc-line">
            {formulaText(formula, a, b, t.locale)} = <strong>{withUnit(result)}</strong>
          </p>
        ) : (
          <p className="v6-calc-line v6-unavailable">
            <strong>{t.unavailable}</strong>
            {why && <> — {why}</>}
          </p>
        )}
        {note && <p className="v6-note">{note}</p>}
      </div>
      <div className={`v6-status${changed ? " is-sim" : ""}`} role="status">
        {changed && <p className="v6-status-title">{t.simulation}</p>}
        <p className="v6-status-ref">
          {t.formula} : <span className="v6-mono">{formulaText(formula, va.value, vb.value, t.locale)} = {refResult !== null ? withUnit(refResult) : t.unavailable}</span>
        </p>
      </div>
      {steps.length > 0 && (
        <div className="v6-calc-steps">
          <p className="v6-result-label">{t.steps}</p>
          <ol>
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
