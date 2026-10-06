"use client";

import { walletChanged } from "@/components/billing/wallet-store";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { apiMessage } from "@/lib/i18n/api";
import { useT } from "@/lib/i18n/client";

interface Answer {
  answer: string;
  inDocument: boolean;
  citations: { location: string; quote: string }[];
  beyond: string | null;
  followups: string[];
}
type Turn = { q: string; a: Answer | null; error?: string };

const draftKey = (reportId: string) => `limpid-ask-draft-${reportId}`;

/**
 * Demander à Limpid (V4, § 8) : portée claire « Ce Limpid » / « Cette section », réponses
 * courtes avec extraits vérifiés, Arrêter pendant la réponse, Réessayer après une erreur.
 * Le brouillon reste dans la session ; rien n'est envoyé sans geste ; l'échange n'est pas
 * enregistré. Le fil ne saute pas en bas si l'on relit un message plus ancien.
 */
export function AskPanel({ reportId, section, initialQuestion = "" }: { reportId: string; section: { id: string; title: string } | null; initialQuestion?: string }) {
  const L = useT();
  const v = L.v4.chat;
  const [turns, setTurns] = useState<Turn[]>([]);
  // Question saisie ailleurs : pré-remplie, jamais envoyée sans geste ; sinon brouillon de la session.
  const [text, setText] = useState(() => {
    if (initialQuestion) return initialQuestion;
    try {
      return sessionStorage.getItem(draftKey(reportId)) ?? "";
    } catch {
      return "";
    }
  });
  const [scoped, setScoped] = useState(!!section);
  const [pending, setPending] = useState(false);
  const [away, setAway] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const scope = scoped ? section : null;

  useEffect(() => setScoped(!!section), [section]);
  useEffect(() => {
    try {
      if (text) sessionStorage.setItem(draftKey(reportId), text);
      else sessionStorage.removeItem(draftKey(reportId));
    } catch {}
  }, [text, reportId]);
  // Nouveau message : on descend seulement si l'on était déjà en bas du fil.
  useEffect(() => {
    if (!away) endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, away]);
  useEffect(() => () => abort.current?.abort(), []);

  function onScroll() {
    const el = threadRef.current;
    if (!el) return;
    setAway(el.scrollHeight - el.scrollTop - el.clientHeight > 80);
  }

  async function ask(question: string, replaceLast = false) {
    const q = question.trim();
    if (q.length < 2 || pending) return;
    if (!replaceLast) setText("");
    setPending(true);
    setAway(false);
    const base = replaceLast ? turns.slice(0, -1) : turns;
    const history = base.filter((t) => t.a).slice(-4).map((t) => ({ q: t.q, a: t.a!.answer }));
    setTurns([...base, { q, a: null }]);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await fetch(`/api/reports/${reportId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, section_id: scope?.id ?? null, history }),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      walletChanged();
      if (!res.ok || typeof data.answer !== "string") throw new Error(apiMessage(L, data, L.ask.failed));
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a: data as Answer } : x)));
    } catch (e) {
      const stopped = (e as Error).name === "AbortError";
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: stopped ? v.stopped : (e as Error).message || L.ask.failed } : x)));
    } finally {
      abort.current = null;
      setPending(false);
    }
  }

  return (
    <div className="ask-panel">
      <div className="ask-scope-v4" role="radiogroup" aria-label={v.scope}>
        <button type="button" role="radio" aria-checked={!scope} className="ask-scope-opt" onClick={() => setScoped(false)}>{v.thisLimpid}</button>
        {section && (
          <button type="button" role="radio" aria-checked={!!scope} className="ask-scope-opt" onClick={() => setScoped(true)}>{v.thisSection}</button>
        )}
      </div>
      <p className="meta ask-scope-note">{scope ? v.sectionNote(scope.title) : v.limpidNote}</p>

      <div className="ask-thread" aria-live="polite" ref={threadRef} onScroll={onScroll}>
        {turns.length === 0 && (
          <div className="ask-suggest stagger">
            {L.ask.suggestions.map((s) => (
              <button key={s} type="button" className="filterchip" onClick={() => ask(s)}>{s}</button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="ask-turn">
            <p className="ask-q"><span className="sr-only">{L.ask.you} : </span>{t.q}</p>
            {t.error ? (
              <div className="notice notice-error" role="alert">
                <p>{t.error}</p>
                {i === turns.length - 1 && (
                  <button type="button" className="btn" disabled={pending} onClick={() => void ask(t.q, true)}>
                    <Icon name="refresh" size={18} /> {v.retry}
                  </button>
                )}
              </div>
            ) : !t.a ? (
              <p className="ask-a ask-wait" role="status">
                <span className="loader-inline" aria-hidden="true"><span className="dot" /><span className="dot" /><span className="dot" /></span> {L.ask.thinking}
              </p>
            ) : (
              <div className="ask-a">
                <span className="sr-only">{L.ask.limpid} : </span>
                {!t.a.inDocument && <p className="chip">{L.ask.notInDoc}</p>}
                <p>{t.a.answer}</p>
                {t.a.citations.map((c, k) => (
                  <blockquote key={k} className="quote ask-quote">
                    « {c.quote} »<cite className="citation"><Icon name="file" /> {c.location}</cite>
                  </blockquote>
                ))}
                {t.a.beyond && (
                  <div className="note">
                    <b>{L.ask.beyond}</b>
                    <p>{t.a.beyond}</p>
                  </div>
                )}
                {i === turns.length - 1 && t.a.followups.length > 0 && (
                  <div className="ask-follow" role="group" aria-label={L.ask.followups}>
                    {t.a.followups.map((f) => (
                      <button key={f} type="button" className="filterchip" onClick={() => ask(f)} disabled={pending}>{f}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {away && turns.length > 0 && (
        <button type="button" className="btn ask-latest" onClick={() => { setAway(false); endRef.current?.scrollIntoView({ block: "end" }); }}>
          {v.latest} <Icon name="chevron" size={16} />
        </button>
      )}

      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(text);
        }}
      >
        <label htmlFor="ask-input" className="sr-only">{L.ask.label}</label>
        <textarea
          id="ask-input"
          rows={1}
          maxLength={500}
          value={text}
          placeholder={L.ask.placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(text);
            }
          }}
        />
        {pending ? (
          <button type="button" className="ask-send ask-stop" aria-label={v.stop} onClick={() => abort.current?.abort()}>
            <Icon name="close" />
          </button>
        ) : (
          <button type="submit" className="ask-send" aria-label={L.ask.send} disabled={text.trim().length < 2}>
            <Icon name="send" />
          </button>
        )}
      </form>
      <p className="muted small ask-private">{L.ask.private}</p>
    </div>
  );
}
