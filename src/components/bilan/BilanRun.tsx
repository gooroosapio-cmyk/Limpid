"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import type { BilanResult, PublicQuestion } from "@/lib/exercises/bilan";
import type { Answer } from "@/lib/exercises/grade";
import { apiMessage } from "@/lib/i18n/api";
import { useLang, useT } from "@/lib/i18n/client";

type Phase = "intro" | "question" | "review" | "result" | "corrections";

interface Draft {
  answers: Record<string, Answer>;
  flagged: string[];
  index: number;
  key: string;
}

const draftKey = (versionId: string) => `limpid-bilan-${versionId}`;
const newKey = () => crypto.randomUUID().replace(/-/g, "");

/** Saisie d'une réponse selon le type de question ; aucune correction avant la soumission. */
function AnswerInput({ q, value, onChange }: { q: PublicQuestion; value: Answer | undefined; onChange: (a: Answer | undefined) => void }) {
  const t = useT();
  const name = `q-${q.id}`;
  switch (q.kind) {
    case "single":
      return (
        <fieldset className="choices bilan-options">
          <legend className="sr-only">{q.prompt}</legend>
          {q.options.map((o) => (
            <label key={o.index} className="choice">
              <input type="radio" name={name} checked={value?.kind === "single" && value.choice === o.index} onChange={() => onChange({ kind: "single", choice: o.index })} />
              <span>{o.text}</span>
            </label>
          ))}
        </fieldset>
      );
    case "multiple": {
      const picked = new Set(value?.kind === "multiple" ? value.choices : []);
      return (
        <fieldset className="choices bilan-options">
          <legend className="muted small">{t.bilan5.several}</legend>
          {q.options.map((o) => (
            <label key={o.index} className="choice">
              <input
                type="checkbox"
                checked={picked.has(o.index)}
                onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(o.index);
                  else next.delete(o.index);
                  onChange(next.size ? { kind: "multiple", choices: [...next].sort() } : undefined);
                }}
              />
              <span>{o.text}</span>
            </label>
          ))}
        </fieldset>
      );
    }
    case "truefalse":
      return (
        <div className="tf-row" role="radiogroup" aria-label={q.prompt}>
          {[true, false].map((v) => (
            <button key={String(v)} type="button" role="radio" aria-checked={value?.kind === "truefalse" && value.value === v} className={`btn tf-btn${value?.kind === "truefalse" && value.value === v ? " is-on" : ""}`} onClick={() => onChange({ kind: "truefalse", value: v })}>
              {v ? t.bilan5.true : t.bilan5.false}
            </button>
          ))}
        </div>
      );
    case "order": {
      const order = value?.kind === "order" ? value.order : q.items;
      const move = (i: number, d: -1 | 1) => {
        const j = i + d;
        if (j < 0 || j >= order.length) return;
        const next = [...order];
        [next[i], next[j]] = [next[j]!, next[i]!];
        onChange({ kind: "order", order: next });
      };
      return (
        <ol className="order-list">
          {order.map((item, i) => (
            <li key={item}>
              <span>{item}</span>
              <span className="order-btns">
                <button type="button" className="ib" disabled={i === 0} aria-label={t.lim.up(item)} onClick={() => move(i, -1)}><Icon name="chevron" className="rot-up" /></button>
                <button type="button" className="ib" disabled={i === order.length - 1} aria-label={t.lim.down(item)} onClick={() => move(i, 1)}><Icon name="chevron" className="rot-down" /></button>
              </span>
            </li>
          ))}
        </ol>
      );
    }
    case "match": {
      const pairs = value?.kind === "match" ? value.pairs : {};
      return (
        <div className="match-list">
          {q.lefts.map((left) => (
            <label key={left} className="match-row">
              <span>{left}</span>
              <select
                value={pairs[left] ?? ""}
                onChange={(e) => {
                  const next = { ...pairs, [left]: e.target.value };
                  if (!e.target.value) delete next[left];
                  onChange(Object.keys(next).length ? { kind: "match", pairs: next } : undefined);
                }}
              >
                <option value="">{t.bilan5.choose}</option>
                {q.rights.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          ))}
        </div>
      );
    }
    case "cloze": {
      const values = value?.kind === "cloze" ? value.values : Array.from({ length: q.blanks }, () => "");
      return (
        <div className="cloze-inputs">
          {values.map((v, i) => (
            <label key={i} className="cloze-input">
              <span className="muted small">{t.bilan5.blank(i + 1)}</span>
              <input
                type="text"
                value={v}
                maxLength={80}
                onChange={(e) => {
                  const next = [...values];
                  next[i] = e.target.value;
                  onChange(next.some((x) => x.trim()) ? { kind: "cloze", values: next } : undefined);
                }}
              />
            </label>
          ))}
        </div>
      );
    }
    case "short":
      return (
        <label className="short-wrap">
          <span className="muted small">{t.bilan5.unscored}</span>
          <textarea className="short-answer" value={value?.kind === "short" ? value.text : ""} maxLength={2000} onChange={(e) => onChange(e.target.value.trim() ? { kind: "short", text: e.target.value } : undefined)} />
        </label>
      );
  }
}

/**
 * Bilan de compréhension (kit V5) : page entière pour l'introduction, les questions et les
 * résultats. Une consigne par écran ; retour possible sur une question avant de soumettre ;
 * « Quitter et reprendre plus tard » garde les réponses sur l'appareil. Corrections après la
 * soumission ; la note est calculée par le serveur.
 */
export function BilanRun({ reportId, versionId, questions, chapters, insufficient }: { reportId: string; versionId: string; questions: PublicQuestion[]; chapters: { id: string; title: string }[]; insufficient: boolean }) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const b = t.bilan5;
  const [phase, setPhase] = useState<Phase>("intro");
  const [draft, setDraft] = useState<Draft>({ answers: {}, flagged: [], index: 0, key: "" });
  const [result, setResult] = useState<BilanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titles = useMemo(() => Object.fromEntries(chapters.map((c) => [c.id, c.title])), [chapters]);
  const covered = new Set(questions.map((q) => q.section_id)).size;
  const resumable = Object.keys(draft.answers).length > 0;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey(versionId)) ?? "null") as Draft | null;
      if (saved?.key) setDraft(saved);
    } catch {}
  }, [versionId]);

  function save(next: Draft) {
    setDraft(next);
    try {
      localStorage.setItem(draftKey(versionId), JSON.stringify(next));
    } catch {}
  }

  function start(fresh: boolean) {
    const next = fresh || !draft.key ? { answers: {}, flagged: [], index: 0, key: newKey() } : draft;
    save(next);
    setResult(null);
    setPhase("question");
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/reports/${reportId}/bilan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: versionId, attempt_key: draft.key, answers: draft.answers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiMessage(t, data, b.failed));
      setResult(data as BilanResult);
      setPhase("result");
      try {
        localStorage.removeItem(draftKey(versionId));
      } catch {}
    } catch (e) {
      setError((e as Error).message || b.failed);
    } finally {
      setBusy(false);
    }
  }

  const back = `/rapports/${reportId}`;
  const header = (title: string) => (
    <header className="rtop">
      <Link className="rtop-close" href={back} aria-label={b.backToCourse}>
        <Icon name="back" />
      </Link>
      <p className="rtop-chapter">{title}</p>
      <span className="rtop-more" aria-hidden="true" />
    </header>
  );
  const fmt = (n: number) => n.toLocaleString(lang === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 1 });

  if (phase === "intro")
    return (
      <>
        {header(t.lim.bilanTitle)}
        <main className="bilan-page">
          <p className="eyebrow">{t.lim.bilanTitle}</p>
          <h1 className="bilan-h1">{b.introTitle(questions.length)}</h1>
          <p>{b.introCoverage(covered, chapters.length)}</p>
          <p className="muted small">{b.rules}</p>
          {insufficient && <p className="notice">{t.lim.bilanInsufficient}</p>}
          {resumable ? (
            <>
              <button type="button" className="btn btn-primary btn-block" onClick={() => start(false)}>{b.resume}</button>
              <button type="button" className="btn btn-block" onClick={() => start(true)}>{b.restart}</button>
            </>
          ) : (
            <button type="button" className="btn btn-primary btn-block" onClick={() => start(true)}>{b.start} <Icon name="arrow" /></button>
          )}
        </main>
      </>
    );

  if (phase === "question") {
    const q = questions[draft.index]!;
    const flagged = draft.flagged.includes(q.id);
    const last = draft.index === questions.length - 1;
    return (
      <>
        {header(t.lim.bilanTitle)}
        <main className="bilan-page">
          <p className="quiz-progress">{t.lim.question(draft.index + 1, questions.length)}</p>
          <progress className="bilan-progress" value={draft.index + 1} max={questions.length} aria-hidden="true" />
          <h1 className="bilan-q">{q.kind === "cloze" ? q.prompt.replace(/_{3,}/g, "____") : q.prompt}</h1>
          <AnswerInput q={q} value={draft.answers[q.id]} onChange={(a) => {
            const answers = { ...draft.answers };
            if (a) answers[q.id] = a;
            else delete answers[q.id];
            save({ ...draft, answers });
          }} />
          <p className="muted small">{b.afterSubmit}</p>
          <label className="consent bilan-flag">
            <input type="checkbox" checked={flagged} onChange={(e) => save({ ...draft, flagged: e.target.checked ? [...draft.flagged, q.id] : draft.flagged.filter((x) => x !== q.id) })} />
            <span>{b.flag}</span>
          </label>
          <div className="actions-row">
            <button type="button" className="btn" disabled={draft.index === 0} onClick={() => save({ ...draft, index: draft.index - 1 })}>{b.previous}</button>
            <button type="button" className="btn btn-primary" onClick={() => (last ? setPhase("review") : save({ ...draft, index: draft.index + 1 }))}>
              {last ? b.finish : b.next} <Icon name="arrow" />
            </button>
          </div>
          <button type="button" className="btn-link" onClick={() => router.push(back)}>{b.quit}</button>
        </main>
      </>
    );
  }

  if (phase === "review") {
    const missing = questions.filter((q) => !draft.answers[q.id]);
    const flagged = questions.filter((q) => draft.flagged.includes(q.id));
    return (
      <>
        {header(t.lim.bilanTitle)}
        <main className="bilan-page">
          <h1 className="bilan-h1">{b.reviewTitle}</h1>
          <p>{b.answered(questions.length - missing.length, questions.length)}</p>
          {missing.length > 0 && <p className="notice">{b.missingWarn(missing.length)}</p>}
          {[...new Set([...flagged, ...missing])].length > 0 && (
            <ul className="rows">
              {[...new Set([...flagged, ...missing])].map((q) => (
                <li key={q.id}>
                  <button type="button" className="row" onClick={() => { save({ ...draft, index: questions.indexOf(q) }); setPhase("question"); }}>
                    <span className="row-text"><b>{t.lim.question(questions.indexOf(q) + 1, questions.length)}</b><small>{draft.answers[q.id] ? b.flagged : b.unanswered}</small></span>
                    <Icon name="chevron" className="row-chevron" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="notice notice-error" role="alert">{error}</p>}
          <button type="button" className={`btn btn-primary btn-block${busy ? " busy" : ""}`} disabled={busy} onClick={submit}>{b.submit}</button>
          <button type="button" className="btn btn-block" onClick={() => setPhase("question")}>{b.backToQuestions}</button>
        </main>
      </>
    );
  }

  if (!result) return null;

  if (phase === "corrections")
    return (
      <>
        {header(b.correctionsTitle)}
        <main className="bilan-page">
          <h1 className="bilan-h1">{b.correctionsTitle}</h1>
          <ol className="bilan-corrections-list">
            {questions.map((q) => {
              const r = result.questions.find((x) => x.id === q.id);
              return (
                <li key={q.id}>
                  <p><b>{q.prompt}</b></p>
                  <p className={`quiz-verdict ${r?.correct ? "ok" : "again"}`}>
                    <Icon name={r?.correct ? "check" : "refresh"} /> {r?.correct === null ? b.unscoredShort : r?.correct ? t.lim.correct : r?.answered ? b.toReview : b.unanswered}
                  </p>
                  {r?.solution && <p><strong>{b.expected}</strong> {r.solution}</p>}
                  {r?.explanation && <p className="exercise-explain">{r.explanation}</p>}
                  <Link className="btn-link" href={`${back}?a=${q.section_id}`}><Icon name="book" size={16} /> {b.reviewPassage}</Link>
                </li>
              );
            })}
          </ol>
          <button type="button" className="btn btn-block" onClick={() => setPhase("result")}>{b.backToResult}</button>
        </main>
      </>
    );

  const stateLabel = { reussi: b.stateOk, a_revoir: b.stateReview, non_evalue: b.stateNone } as const;
  return (
    <>
      {header(b.resultHeader)}
      <main className="bilan-page">
        <p className="eyebrow">{b.resultEyebrow}</p>
        <p className="bilan-score" role="status"><span className="big">{fmt(result.on20)}</span><span className="of">/20</span></p>
        <p>{t.lim.bilanAnswers(result.score, result.total)}</p>
        <p className="muted small">{b.scoreNote}</p>
        <ul className="bilan-chapters">
          {result.chapters.map((c) => (
            <li key={c.section_id} className={`bilan-chapter state-${c.state}`}>
              <span className="bilan-chapter-title">{titles[c.section_id] ?? c.section_id}</span>
              <span className="bilan-chapter-state">{c.state === "reussi" ? "✓ " : c.state === "a_revoir" ? "↻ " : ""}{stateLabel[c.state]}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-primary btn-block" onClick={() => setPhase("corrections")}>{b.seeCorrections}</button>
        <Link className="btn btn-block" href={back}>{b.backToCourse}</Link>
        <button type="button" className="btn btn-block" onClick={() => start(true)}>{b.newAttempt}</button>
      </main>
    </>
  );
}
