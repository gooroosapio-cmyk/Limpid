"use client";

import { walletChanged } from "@/components/billing/wallet-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { apiMessage } from "@/lib/i18n/api";
import { useT } from "@/lib/i18n/client";
import { newTraceId, reportMetric } from "@/lib/perf/client";
import type { ChatEvent, ChatExtras, ChatMessageView } from "@/lib/chat/service";

type AnswerState = "waiting" | "streaming" | "stopping" | "done" | "stopped" | "failed";
interface Turn {
  clientId: string;
  q: string;
  /** Envoi de la question : en cours, acceptée par le serveur, ou non envoyée. */
  send: "sending" | "sent" | "unsent";
  messageId: string | null;
  answer: string;
  state: AnswerState;
  extras: ChatExtras;
  error?: string;
}

const draftKey = (reportId: string) => `limpid-ask-draft-${reportId}`;
const newClientId = () => crypto.randomUUID().replace(/-/g, "");

function fromHistory(messages: ChatMessageView[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of messages) {
    if (m.role !== "user") continue;
    const a = messages.find((x) => x.reply_to === m.id);
    const state: AnswerState = !a ? "failed" : a.status === "stopping" ? "streaming" : a.status;
    turns.push({ clientId: m.client_id ?? m.id, q: m.content, send: "sent", messageId: a?.id ?? null, answer: a?.content ?? "", state, extras: a?.extras ?? {} });
  }
  return turns;
}

/**
 * « Une question ? » (prompt « Fluidité », § 2) : la question s'affiche aussitôt avec son état
 * réel (« Envoi… », puis acceptée, ou « Non envoyé » avec reprise) ; la réponse s'écrit au fil
 * de l'eau. Le serveur rédige et enregistre : fermer le panneau ou perdre le réseau n'annule
 * rien, la réponse est retrouvée dans le fil. « Arrêter » interrompt en gardant le texte écrit.
 * Une réponse à la fois par conversation ; le champ reste utilisable pendant la rédaction.
 */
export function AskPanel({ reportId, section, initialQuestion = "" }: { reportId: string; section: { id: string; title: string } | null; initialQuestion?: string }) {
  const L = useT();
  const v = L.v4.chat;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState(() => {
    if (initialQuestion) return initialQuestion;
    try {
      return sessionStorage.getItem(draftKey(reportId)) ?? "";
    } catch {
      return "";
    }
  });
  const [scoped, setScoped] = useState(!!section);
  const [away, setAway] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const [tracking, setTracking] = useState(true);
  const threadRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const scope = scoped ? section : null;
  const busy = turns.some((t) => t.send === "sending" || t.state === "waiting" || t.state === "streaming" || t.state === "stopping");

  const patch = useCallback((clientId: string, p: Partial<Turn> | ((t: Turn) => Partial<Turn>)) => {
    if (!mounted.current) return;
    setTurns((list) => list.map((t) => (t.clientId === clientId ? { ...t, ...(typeof p === "function" ? p(t) : p) } : t)));
  }, []);

  /** Suivi par l'état enregistré (réseau revenu, flux coupé) jusqu'à la fin de la réponse. */
  const follow = useCallback(
    async (clientId: string, messageId: string) => {
      for (let wait = 1_000; mounted.current; wait = Math.min(wait * 1.5, 5_000)) {
        if (document.visibilityState === "hidden" || !navigator.onLine) {
          setTracking(navigator.onLine);
          await new Promise((r) => setTimeout(r, 2_000));
          continue;
        }
        const res = await fetch(`/api/reports/${reportId}/chat/${messageId}`, { cache: "no-store" }).catch(() => null);
        if (!res?.ok) {
          setTracking(false);
        } else {
          setTracking(true);
          const { message } = (await res.json()) as { message: ChatMessageView };
          const done = message.status === "done" || message.status === "stopped" || message.status === "failed";
          patch(clientId, { answer: message.content, extras: message.extras, state: done ? message.status : "streaming", error: message.status === "failed" ? L.ask.failed : undefined });
          if (done) return walletChanged();
        }
        await new Promise((r) => setTimeout(r, wait));
      }
    },
    [reportId, patch, L.ask.failed],
  );

  useEffect(() => {
    mounted.current = true;
    // Fil conservé : rouvrir le panneau retrouve les échanges, y compris une réponse en cours.
    void fetch(`/api/reports/${reportId}/chat`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then(({ messages }: { messages: ChatMessageView[] }) => {
        if (!mounted.current || !messages?.length) return;
        const restored = fromHistory(messages);
        setTurns((now) => [...restored, ...now.filter((t) => !restored.some((r) => r.clientId === t.clientId))]);
        for (const t of restored) if (t.state === "streaming" && t.messageId) void follow(t.clientId, t.messageId);
      })
      .catch(() => undefined);
    return () => {
      mounted.current = false;
    };
  }, [reportId, follow]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- la portée suit le chapitre affiché
  useEffect(() => setScoped(!!section), [section]);
  useEffect(() => {
    try {
      if (text) sessionStorage.setItem(draftKey(reportId), text);
      else sessionStorage.removeItem(draftKey(reportId));
    } catch {}
  }, [text, reportId]);
  // Le fil suit la réponse seulement si l'on est déjà en bas ; sinon « Nouveaux messages ».
  useEffect(() => {
    if (!away) endRef.current?.scrollIntoView({ block: "end" });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- signal visuel dérivé du défilement
    else setUnseen(true);
  }, [turns, away]);

  function onScroll() {
    const el = threadRef.current;
    if (!el) return;
    const isAway = el.scrollHeight - el.scrollTop - el.clientHeight > 80;
    setAway(isAway);
    if (!isAway) setUnseen(false);
  }

  async function send(turn: Turn) {
    const t0 = performance.now();
    const traceId = newTraceId();
    let accepted = false;
    let firstText = true;
    try {
      const res = await fetch(`/api/reports/${reportId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-trace-id": traceId },
        body: JSON.stringify({ question: turn.q, section_id: scope?.id ?? null, client_id: turn.clientId }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        walletChanged();
        // Refus explicite (crédits, débit) : la question n'a pas été acceptée.
        return patch(turn.clientId, { send: "unsent", state: "failed", error: apiMessage(L, data, L.ask.failed) });
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buffer.indexOf("\n\n")) >= 0) {
          const line = buffer.slice(0, cut).trim();
          buffer = buffer.slice(cut + 2);
          if (!line.startsWith("data:")) continue;
          const e = JSON.parse(line.slice(5)) as ChatEvent;
          if (e.type === "accepted") {
            accepted = true;
            patch(turn.clientId, { send: "sent", messageId: e.message_id, state: "waiting" });
          } else if (e.type === "text") {
            if (firstText) {
              firstText = false;
              reportMetric("chat.first_text", performance.now() - t0, { traceId });
            }
            patch(turn.clientId, (t) => ({ answer: t.answer.slice(0, e.from) + e.text, state: t.state === "stopping" ? "stopping" : "streaming" }));
          } else if (e.type === "done" || e.type === "stopped") {
            patch(turn.clientId, { answer: e.message.content, extras: e.message.extras, state: e.type });
            reportMetric("chat.total", performance.now() - t0, { traceId });
            walletChanged();
            return;
          } else if (e.type === "error") {
            patch(turn.clientId, { state: "failed", error: e.message });
            walletChanged();
            return;
          }
        }
      }
      // Flux interrompu avant la fin : la réponse continue sur le serveur ; on la suit.
      setTurns((list) => {
        const t = list.find((x) => x.clientId === turn.clientId);
        if (t?.messageId) void follow(turn.clientId, t.messageId);
        return list;
      });
    } catch {
      if (!accepted) {
        patch(turn.clientId, { send: "unsent", state: "failed", error: undefined });
        return;
      }
      setTurns((list) => {
        const t = list.find((x) => x.clientId === turn.clientId);
        if (t?.messageId) void follow(turn.clientId, t.messageId);
        return list;
      });
    }
  }

  function ask(question: string) {
    const q = question.trim();
    if (q.length < 2 || busy) return;
    const t0 = performance.now();
    setText("");
    setAway(false);
    const turn: Turn = { clientId: newClientId(), q, send: "sending", messageId: null, answer: "", state: "waiting", extras: {} };
    setTurns((list) => [...list, turn]);
    requestAnimationFrame(() => reportMetric("chat.local_echo", performance.now() - t0));
    void send(turn);
  }

  /** Renvoi d'une question non acceptée : même identifiant, jamais deux réponses. */
  function resend(turn: Turn) {
    if (busy) return;
    const again = { ...turn, send: "sending" as const, state: "waiting" as const, error: undefined, answer: "" };
    patch(turn.clientId, again);
    void send(again);
  }

  async function stop(turn: Turn) {
    if (!turn.messageId) return;
    patch(turn.clientId, { state: "stopping" });
    const res = await fetch(`/api/reports/${reportId}/chat/${turn.messageId}/stop`, { method: "POST" }).catch(() => null);
    if (!res?.ok) patch(turn.clientId, { state: "streaming" });
  }

  const active = turns.find((t) => t.state === "waiting" || t.state === "streaming" || t.state === "stopping");
  const last = turns[turns.length - 1];

  return (
    <div className="ask-panel">
      <label className="ask-context">
        <span className="ask-context-label">{v.context}</span>
        <span className="ask-context-field">
          <Icon name="target" size={18} />
          <select aria-label={v.scope} value={scope ? "section" : "all"} disabled={!section} onChange={(e) => setScoped(e.target.value === "section")}>
            <option value="all">{v.thisLimpid}</option>
            {section && <option value="section">{v.thisSection} : {section.title}</option>}
          </select>
          {section && <Icon name="chevron" size={16} className="ask-context-caret" />}
        </span>
      </label>
      <p className="ask-context-note">{scope ? v.sectionNote(scope.title) : v.limpidNote}</p>

      <div className="ask-thread" ref={threadRef} onScroll={onScroll}>
        {turns.length === 0 && (
          <div className="ask-suggest stagger">
            {L.ask.suggestions.map((s) => (
              <button key={s} type="button" className="filterchip" onClick={() => ask(s)}>{s}</button>
            ))}
          </div>
        )}
        {turns.map((t) => (
          <div key={t.clientId} className="ask-turn">
            <p className={`ask-q${t.send === "unsent" ? " is-unsent" : ""}`}><span className="sr-only">{L.ask.you} : </span>{t.q}</p>
            {t.send === "sending" && <p className="ask-meta" role="status">{v.sending}</p>}
            {t.send === "unsent" ? (
              <div className="ask-meta ask-unsent" role="alert">
                <span>{t.error ?? v.unsent}</span>
                <button type="button" className="btn-link" disabled={busy} onClick={() => resend(t)}>{v.resend}</button>
              </div>
            ) : t.send === "sent" && (
              <div className="ask-a" aria-busy={t.state === "waiting" || t.state === "streaming"}>
                <span className="sr-only">{L.ask.limpid} : </span>
                {t.state === "done" && t.extras.in_document === false && <p className="chip">{L.ask.notInDoc}</p>}
                {t.answer ? (
                  <p className="ask-text">
                    {t.answer}
                    {(t.state === "streaming" || t.state === "stopping") && <span className="ask-caret" aria-hidden="true" />}
                  </p>
                ) : (t.state === "waiting" || t.state === "streaming") ? (
                  <p className="ask-wait">
                    <span className="loader-inline" aria-hidden="true"><span className="dot" /><span className="dot" /><span className="dot" /></span> {L.ask.thinking}
                  </p>
                ) : null}
                {t.state === "stopped" && <p className="ask-meta">{v.stopped}</p>}
                {t.state === "failed" && (
                  <div className="notice notice-error" role="alert"><p>{t.error ?? L.ask.failed}</p></div>
                )}
                {t.state === "done" && (t.extras.citations ?? []).map((c, k) => (
                  <details key={k} className="ask-source">
                    <summary><Icon name="file" size={16} /> {c.location} <Icon name="chevron" size={14} /></summary>
                    <blockquote className="quote ask-quote">« {c.quote} »</blockquote>
                  </details>
                ))}
                {t.state === "done" && t.extras.beyond && (
                  <div className="note">
                    <b>{L.ask.beyond}</b>
                    <p>{t.extras.beyond}</p>
                  </div>
                )}
                {t === last && t.state === "done" && (t.extras.followups ?? []).length > 0 && (
                  <div className="ask-follow" role="group" aria-label={v.suggestion}>
                    <p className="ask-follow-label">{v.suggestion}</p>
                    <button type="button" className="ask-suggestion" onClick={() => ask(t.extras.followups![0]!)} disabled={busy}>
                      <Icon name="spark" size={18} />
                      <span>{t.extras.followups![0]}</span>
                      <Icon name="chevron" size={18} />
                    </button>
                  </div>
                )}
                {t === last && t.state === "failed" && (
                  <button type="button" className="btn" disabled={busy} onClick={() => ask(t.q)}>
                    <Icon name="refresh" size={18} /> {v.retry}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {/* Annonce des changements d'état seulement (jamais chaque mot rédigé). */}
      <p className="sr-only" role="status" aria-live="polite">{active ? (active.state === "stopping" ? v.stopping : v.writing) : last?.state === "stopped" ? v.stopped : ""}</p>
      {!tracking && active && <p className="ask-meta ask-tracking" role="status">{v.tracking}</p>}
      {away && unseen && turns.length > 0 && (
        <button type="button" className="btn ask-latest" onClick={() => { setAway(false); setUnseen(false); endRef.current?.scrollIntoView({ block: "end" }); }}>
          {v.newer} <Icon name="chevron" size={16} />
        </button>
      )}

      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <label htmlFor="ask-input" className="sr-only">{L.ask.label}</label>
        <textarea
          id="ask-input"
          rows={Math.min(4, Math.max(1, text.split("\n").length, Math.ceil(text.length / 38)))}
          maxLength={500}
          value={text}
          placeholder={L.ask.placeholder}
          aria-describedby={busy && text.trim() ? "ask-one" : undefined}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(text);
            }
          }}
        />
        {active && active.messageId && active.state !== "waiting" ? (
          <button type="button" className="ask-send ask-stop" aria-label={v.stop} disabled={active.state === "stopping"} onClick={() => void stop(active)}>
            <Icon name="close" />
          </button>
        ) : (
          <button type="submit" className="ask-send" aria-label={L.ask.send} disabled={busy || text.trim().length < 2}>
            <Icon name="send" />
          </button>
        )}
      </form>
      {busy && text.trim() && <p id="ask-one" className="ask-meta">{v.oneAtATime}</p>}
      <p className="ask-private"><span className="ask-cost"><Icon name="coins" size={14} /> {v.cost}</span> · {v.mistakes}</p>
    </div>
  );
}
