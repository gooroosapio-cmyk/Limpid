"use client";

import { useId, useMemo, useState } from "react";
import { clearDrafts, useDraft } from "./draft";
import { Icon } from "@/components/Icon";
import type { Exercise } from "@/lib/contracts/schemas";
import { grade, shuffled, type Answer } from "@/lib/exercises/grade";
import { apiMessage } from "@/lib/i18n/api";
import { useT } from "@/lib/i18n/client";
import { parseRich } from "@/lib/reader/rich";

export interface ExerciseResult {
  id: string;
  correct: boolean | null;
  ratio: number | null;
}

function Rich({ text }: { text: string }) {
  return (
    <>
      {parseRich(text).map((r, i) => (r.bold ? <strong key={i}>{r.text}</strong> : r.italic ? <em key={i}>{r.text}</em> : <span key={i}>{r.text}</span>))}
    </>
  );
}

/**
 * Une question (V4, § 10) : QCM, choix multiples, vrai/faux, classement (boutons),
 * association, texte à trous ou réponse libre. Correction déterministe, sauf la réponse
 * libre (indicative). Aucun rouge punitif : « À revoir » et une explication.
 */
export function ExerciseView({
  ex,
  reportId,
  versionId,
  onDone,
  onGoTo,
  heading,
}: {
  ex: Exercise;
  reportId: string | null;
  versionId: string | null;
  onDone: (r: ExerciseResult) => void;
  onGoTo?: (sectionId: string) => void;
  heading?: string;
}) {
  const t = useT();
  const base = useId();
  // Réponses non validées gardées pour l'onglet (aller consulter une annexe puis revenir).
  const draft = `limpid-draft-${reportId ?? "demo"}-${versionId ?? ""}-${ex.id}`;
  const [single, setSingle] = useDraft<number | null>(`${draft}-s`, null);
  const [multi, setMulti] = useDraft<number[]>(`${draft}-m`, []);
  const [truth, setTruth] = useDraft<boolean | null>(`${draft}-t`, null);
  const initialOrder = useMemo(() => shuffled(ex.items, ex.id), [ex.items, ex.id]);
  const [order, setOrder] = useDraft<string[]>(`${draft}-o`, initialOrder);
  const rights = useMemo(() => shuffled(ex.pairs.map((p) => p.right), `${ex.id}-r`), [ex.pairs, ex.id]);
  const [pairs, setPairs] = useDraft<Record<string, string>>(`${draft}-p`, {});
  const [blanks, setBlanks] = useDraft<string[]>(`${draft}-b`, ex.blanks.map(() => ""));
  const [text, setText] = useDraft(`${draft}-x`, "");
  const [result, setResult] = useState<{ correct: boolean | null; ratio: number | null; feedback?: string; error?: string } | null>(null);
  const [pending, setPending] = useState(false);

  const answer: Answer | null =
    ex.kind === "single" ? (single === null ? null : { kind: "single", choice: single })
    : ex.kind === "multiple" ? (multi.length ? { kind: "multiple", choices: multi } : null)
    : ex.kind === "truefalse" ? (truth === null ? null : { kind: "truefalse", value: truth })
    : ex.kind === "order" ? { kind: "order", order }
    : ex.kind === "match" ? (Object.keys(pairs).length === ex.pairs.length ? { kind: "match", pairs } : null)
    : ex.kind === "cloze" ? (blanks.every((b) => b.trim()) ? { kind: "cloze", values: blanks } : null)
    : text.trim().length >= 2 ? { kind: "short", text } : null;

  async function validate() {
    if (!answer || result) return;
    clearDrafts(`${draft}-`);
    if (answer.kind !== "short") {
      const g = grade(ex, answer);
      const r = { correct: g?.correct ?? false, ratio: g?.ratio ?? 0 };
      setResult(r);
      onDone({ id: ex.id, ...r });
      return;
    }
    // Réponse libre : correction indicative par le modèle léger (rapport réel seulement).
    if (!reportId || !versionId) {
      setResult({ correct: null, ratio: null });
      onDone({ id: ex.id, correct: null, ratio: null });
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/exercises`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: versionId, exercise_id: ex.id, answer: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiMessage(t, data, ""));
      const covered = Array.isArray(data.points) ? data.points.filter((p: { covered: boolean }) => p.covered).length / Math.max(1, data.points.length) : null;
      const r = { correct: data.verdict === "correct", ratio: covered, feedback: typeof data.feedback === "string" ? data.feedback : undefined };
      setResult(r);
      onDone({ id: ex.id, correct: r.correct, ratio: r.ratio });
    } catch (e) {
      setResult({ correct: null, ratio: null, error: (e as Error).message || undefined });
      onDone({ id: ex.id, correct: null, ratio: null });
    } finally {
      setPending(false);
    }
  }

  const done = !!result;
  const move = (i: number, d: -1 | 1) =>
    setOrder((o) => {
      const j = i + d;
      if (j < 0 || j >= o.length) return o;
      const next = [...o];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const verdict = result?.correct === true ? "ok" : result?.correct === false && (result.ratio ?? 0) > 0 ? "partial" : result?.correct === false ? "again" : null;
  const clozeParts = ex.prompt.split(/_{3,}/);

  return (
    <div className="exercise" data-kind={ex.kind}>
      {heading && <p className="exercise-head">{heading}</p>}
      {ex.kind === "cloze" ? (
        <p className="exercise-prompt">
          {clozeParts.map((part, i) => (
            <span key={i}>
              <Rich text={part} />
              {i < clozeParts.length - 1 && (
                <input
                  className="cloze-input"
                  aria-label={t.lim.blank(i + 1)}
                  value={blanks[i] ?? ""}
                  disabled={done}
                  onChange={(e) => setBlanks((b) => b.map((x, k) => (k === i ? e.target.value : x)))}
                  autoComplete="off"
                />
              )}
            </span>
          ))}
        </p>
      ) : (
        <p className="exercise-prompt" id={`${base}-q`}><Rich text={ex.prompt} /></p>
      )}
      {ex.kind === "multiple" && <p className="exercise-hint">{t.lim.several}</p>}

      {(ex.kind === "single" || ex.kind === "multiple") && (
        <fieldset className="choices exercise-options" aria-labelledby={`${base}-q`} disabled={done}>
          {ex.options.map((o, i) => {
            const picked = ex.kind === "single" ? single === i : multi.includes(i);
            const state = !done ? "" : o.correct ? " is-answer" : picked ? " is-picked" : " is-other";
            return (
              <label key={i} className={`choice exercise-option${state}`}>
                <input
                  type={ex.kind === "single" ? "radio" : "checkbox"}
                  name={`${base}-opt`}
                  checked={picked}
                  onChange={() => (ex.kind === "single" ? setSingle(i) : setMulti((m) => (m.includes(i) ? m.filter((x) => x !== i) : [...m, i])))}
                />
                <span>
                  <Rich text={o.text} />
                  {done && (o.correct || picked) && <span className="exercise-why">{o.why}</span>}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      {ex.kind === "truefalse" && (
        <div className="tf" role="radiogroup" aria-labelledby={`${base}-q`}>
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={truth === v}
              className={`btn tf-btn${truth === v ? " is-on" : ""}${done && ex.truth === v ? " is-answer" : ""}`}
              disabled={done}
              onClick={() => setTruth(v)}
            >
              {v ? t.lim.trueLabel : t.lim.falseLabel}
            </button>
          ))}
        </div>
      )}

      {ex.kind === "order" && (
        <>
          <p className="exercise-hint">{t.lim.orderHint}</p>
          <ol className="order-list">
            {order.map((item, i) => (
              <li key={item} className={done ? (ex.items[i] === item ? "is-answer" : "is-picked") : ""}>
                <span className="order-text"><Rich text={item} /></span>
                <span className="order-moves">
                  <button type="button" className="ib" disabled={done || i === 0} aria-label={t.lim.up(item)} onClick={() => move(i, -1)}>
                    <Icon name="chevron" className="rot-up" size={18} />
                  </button>
                  <button type="button" className="ib" disabled={done || i === order.length - 1} aria-label={t.lim.down(item)} onClick={() => move(i, 1)}>
                    <Icon name="chevron" className="rot-down" size={18} />
                  </button>
                </span>
              </li>
            ))}
          </ol>
          {done && !result?.correct && (
            <p className="exercise-why"><strong>{t.lim.correctAnswer}</strong> {ex.items.join(" → ")}</p>
          )}
        </>
      )}

      {ex.kind === "match" && (
        <>
          <p className="exercise-hint">{t.lim.matchHint}</p>
          <div className="match-list">
            {ex.pairs.map((p) => (
              <div key={p.left} className={`match-row${done ? (pairs[p.left] === p.right ? " is-answer" : " is-picked") : ""}`}>
                <label htmlFor={`${base}-m-${p.left}`}><Rich text={p.left} /></label>
                <select id={`${base}-m-${p.left}`} value={pairs[p.left] ?? ""} disabled={done} onChange={(e) => setPairs((x) => ({ ...x, [p.left]: e.target.value }))}>
                  <option value="" disabled>{t.lim.choose}</option>
                  {rights.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {done && pairs[p.left] !== p.right && <span className="exercise-why">→ {p.right}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {ex.kind === "short" && (
        <>
          <label htmlFor={`${base}-short`} className="sr-only">{t.lim.yourAnswer}</label>
          <textarea id={`${base}-short`} className="short-answer" value={text} disabled={done || pending} onChange={(e) => setText(e.target.value)} placeholder={t.lim.yourAnswer} maxLength={2000} />
        </>
      )}

      {!done ? (
        <button type="button" className={`btn btn-primary btn-block${pending ? " busy" : ""}`} disabled={!answer || pending} onClick={validate}>
          {pending ? t.lim.grading : t.lim.validate}
        </button>
      ) : (
        <div className="exercise-result" role="status">
          {verdict && (
            <p className={`quiz-verdict ${verdict === "ok" ? "ok" : "again"}`}>
              <Icon name={verdict === "ok" ? "check" : "refresh"} /> {verdict === "ok" ? t.lim.correct : verdict === "partial" ? t.lim.partial : t.lim.incorrect}
            </p>
          )}
          {ex.kind === "cloze" && !result?.correct && (
            <p className="exercise-why"><strong>{t.lim.correctAnswer}</strong> {ex.blanks.map((b) => b[0]).join(" · ")}</p>
          )}
          {ex.kind === "short" && (
            <>
              {result?.feedback && <p>{result.feedback}</p>}
              {result?.error && <p className="notice">{result.error}</p>}
              <p className="muted small">{t.lim.indicative}</p>
              <p className="exercise-why"><strong>{t.lim.expected}</strong> {ex.expected}</p>
            </>
          )}
          <p className="exercise-explain"><Rich text={ex.explanation} /></p>
          {ex.notion && result?.correct !== true && onGoTo && (
            <button type="button" className="btn-link" onClick={() => onGoTo(ex.section_id)}>
              <Icon name="book" size={16} /> {t.lim.goTo} · {ex.notion}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
