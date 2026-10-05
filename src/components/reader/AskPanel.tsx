"use client";

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

/**
 * Poser une question au document (kit V3, écran 09) : lié à la partie lue, réponses courtes
 * avec extraits vérifiés, suites proposées. L'échange reste sur cet écran (non enregistré).
 */
export function AskPanel({ reportId, section }: { reportId: string; section: { id: string; title: string } | null }) {
  const L = useT();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [scope, setScope] = useState<{ id: string; title: string } | null>(section);
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => setScope(section), [section]);
  useEffect(() => endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }), [turns]);

  async function ask(question: string) {
    const q = question.trim();
    if (q.length < 2 || pending) return;
    setText("");
    setPending(true);
    const history = turns.filter((t) => t.a).slice(-4).map((t) => ({ q: t.q, a: t.a!.answer }));
    setTurns((t) => [...t, { q, a: null }]);
    try {
      const res = await fetch(`/api/reports/${reportId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, section_id: scope?.id ?? null, history }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.answer !== "string") throw new Error(apiMessage(L, data, L.ask.failed));
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a: data as Answer } : x)));
    } catch (e) {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: (e as Error).message || L.ask.failed } : x)));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ask-panel">
      <p className="ask-scope">
        <span className="muted small">{L.ask.about} :</span>{" "}
        {scope ? (
          <button type="button" className="chip chip-yellow" onClick={() => setScope(null)} aria-label={`${scope.title} — ${L.ask.whole}`}>
            {scope.title} <Icon name="close" size={14} />
          </button>
        ) : (
          <span className="chip">{L.ask.whole}</span>
        )}
      </p>

      <div className="ask-thread" aria-live="polite">
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
              <p className="notice notice-error" role="alert">{t.error}</p>
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
        <button type="submit" className="ask-send" aria-label={L.ask.send} disabled={pending || text.trim().length < 2}>
          <Icon name="arrow" />
        </button>
      </form>
      <p className="muted small ask-private">{L.ask.private}</p>
    </div>
  );
}
