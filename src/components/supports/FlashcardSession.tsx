"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { ReportLink } from "@/components/ReportLink";
import { VisualFigure } from "@/components/reader/Visuals";
import type { VisualSpec } from "@/lib/contracts/schemas";
import { useT } from "@/lib/i18n/client";
import type { AssetView } from "@/lib/render/visuals";
import type { FlashcardBank } from "@/lib/supports/flashcards";
import { MAX_PASSES, requeue, type CardState, type Rating } from "@/lib/supports/schedule";

export interface SessionSnapshot {
  id: string | null;
  queue: string[];
  position: number;
  revealed: string | null;
}

interface Rated {
  cardId: string;
  rating: Rating;
  key: string;
  position: number;
  /** Copie de la carte remise plus loin dans la file (« À revoir »), à retirer si la note change. */
  requeuedAt: number | null;
}

interface PendingEvent {
  card_id: string;
  card_version: number;
  rating: Rating;
  idempotency_key: string;
  session_id: string | null;
  replaces: string | null;
  occurred_at: string;
}

const pendingKey = (reportId: string) => `limpid-fc-pending:${reportId}`;
function readPending(reportId: string): PendingEvent[] {
  try {
    const v = JSON.parse(localStorage.getItem(pendingKey(reportId)) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function writePending(reportId: string, list: PendingEvent[]) {
  try {
    if (list.length) localStorage.setItem(pendingKey(reportId), JSON.stringify(list.slice(-200)));
    else localStorage.removeItem(pendingKey(reportId));
  } catch {}
}

/**
 * Session de flashcards (§ 7) : question (et visuel utile) au recto, réflexion sans saisie,
 * « Voir la réponse », puis réponse, explication et « Revoir dans le cours » ; les trois notes
 * n'apparaissent qu'après révélation. Chaque note est enregistrée une seule fois (clé), avec
 * envoi différé hors connexion ; une note accidentelle se corrige aussitôt. Seule la face active
 * est rendue (la réponse n'est jamais dans le DOM du recto). Aucun appel IA.
 */
export function FlashcardSession({
  reportId,
  bank,
  snapshot,
  visuals,
  assets,
  onExit,
}: {
  reportId: string;
  bank: FlashcardBank;
  snapshot: SessionSnapshot;
  visuals: VisualSpec[];
  assets: Record<string, AssetView>;
  onExit: (updates: Record<string, { next_review_at: string | null; last_rating: string | null }>) => void;
}) {
  const t = useT();
  const r = t.supports.review;
  const byId = useMemo(() => new Map(bank.cards.map((c) => [c.id, c])), [bank]);
  const visualsById = useMemo(() => new Map(visuals.map((v) => [v.id, v])), [visuals]);
  const [queue, setQueue] = useState(() => snapshot.queue.filter((id) => byId.has(id)));
  const [position, setPosition] = useState(snapshot.position);
  const [revealed, setRevealed] = useState(!!snapshot.revealed && snapshot.revealed === snapshot.queue[snapshot.position]);
  const [sessionId, setSessionId] = useState<string | null>(snapshot.id);
  const [history, setHistory] = useState<Rated[]>([]);
  const [correcting, setCorrecting] = useState<Rated | null>(null);
  const [repeated, setRepeated] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [updates, setUpdates] = useState<Record<string, { next_review_at: string | null; last_rating: string | null }>>({});
  const answerRef = useRef<HTMLHeadingElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const done = position >= queue.length;
  const card = !done ? byId.get(queue[position]!) : undefined;

  /** Envoie les notes en attente (ordre conservé) ; garde celles qui échouent pour plus tard. */
  const flush = useCallback(async () => {
    const list = readPending(reportId);
    if (!list.length) {
      setOffline(false);
      return;
    }
    const left: PendingEvent[] = [];
    for (const ev of list) {
      if (left.length) {
        left.push(ev);
        continue;
      }
      const res = await fetch(`/api/reports/${reportId}/revisions/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ev),
      }).catch(() => null);
      if (!res) {
        left.push(ev);
        continue;
      }
      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as { state?: CardState };
        if (body.state) setUpdates((u) => ({ ...u, [ev.card_id]: { next_review_at: body.state!.next_review_at, last_rating: body.state!.last_rating } }));
      }
      // Erreur définitive (carte retirée, requête refusée) : la note n'est pas renvoyée en boucle.
    }
    writePending(reportId, left);
    setOffline(left.length > 0);
  }, [reportId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation réseau (notes en attente)
    void flush();
    const online = () => void flush();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [flush]);

  /** Session enregistrée côté serveur (reprise sur un autre appareil ou après fermeture). */
  const persist = useCallback(
    async (q: string[], pos: number, shown: string | null, status: "active" | "done" | "abandoned") => {
      const res = await fetch(`/api/reports/${reportId}/revisions/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, queue: q, position: pos, revealed_card_id: shown, status }),
      }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as { sessionId?: string } | null;
      if (body?.sessionId && body.sessionId !== sessionId) setSessionId(body.sessionId);
    },
    [reportId, sessionId],
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- enregistrement serveur de la session
    void persist(queue, position, revealed && card ? card.id : null, done ? "done" : "active");
    // Seuls la position, la file et la révélation déclenchent un enregistrement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, position, revealed]);

  useEffect(() => {
    if (revealed) answerRef.current?.focus();
    else questionRef.current?.focus();
  }, [revealed, position]);

  function rate(rating: Rating) {
    if (!card || !revealed) return;
    const key = crypto.randomUUID();
    const replaces = correcting?.cardId === card.id ? correcting.key : null;
    let q = queue;
    // Correction : la copie remise plus loin par l'ancienne note « À revoir » est retirée.
    if (correcting && correcting.requeuedAt !== null && q[correcting.requeuedAt] === card.id) q = [...q.slice(0, correcting.requeuedAt), ...q.slice(correcting.requeuedAt + 1)];
    let requeuedAt: number | null = null;
    if (rating === "again") {
      const next = requeue(q, position, card.id);
      if (next.requeued) {
        requeuedAt = next.queue.indexOf(card.id, position + 1);
        q = next.queue;
      } else if (q.filter((id) => id === card.id).length >= MAX_PASSES) setRepeated(card.id);
    }
    const ev: PendingEvent = { card_id: card.id, card_version: card.version, rating, idempotency_key: key, session_id: sessionId, replaces, occurred_at: new Date().toISOString() };
    writePending(reportId, [...readPending(reportId), ev]);
    void flush();
    const entry: Rated = { cardId: card.id, rating, key, position, requeuedAt };
    setHistory((h) => (replaces ? [...h.slice(0, -1), entry] : [...h, entry]));
    setCorrecting(null);
    setQueue(q);
    setPosition(position + 1);
    setRevealed(false);
  }

  /** Retour à la carte précédente : réponse visible, note modifiable (correction immédiate). */
  function back() {
    const last = history[history.length - 1];
    if (!last) return;
    setCorrecting(last);
    setPosition(last.position);
    setRevealed(true);
    setRepeated(null);
  }

  /** Carte suivante sans changer la note (après un retour). */
  function skipCorrection() {
    if (!correcting) return;
    setCorrecting(null);
    setPosition(position + 1);
    setRevealed(false);
  }

  function stop() {
    void persist(queue, position, revealed && card ? card.id : null, "active");
    onExit(updates);
  }

  const counts = useMemo(() => {
    const last = new Map<string, Rating>();
    for (const h of history) last.set(h.cardId, h.rating);
    const v = [...last.values()];
    return { good: v.filter((x) => x === "good").length, hard: v.filter((x) => x === "hard").length, again: v.filter((x) => x === "again").length };
  }, [history]);

  const figure = (id: string | null) => {
    const v = id ? visualsById.get(id) : undefined;
    if (!v) return null;
    const assetId = v.kind === "illustration" ? (v.data as { asset_id?: unknown }).asset_id : null;
    const asset = typeof assetId === "string" ? assets[assetId] : undefined;
    if (v.kind === "illustration" && !asset) return null;
    return (
      <div className="fc-visual">
        <VisualFigure visual={v} refs={null} asset={asset} showIllustrations />
      </div>
    );
  };

  if (done) {
    return (
      <section className="fc fc-done" aria-labelledby="fc-done-h">
        <h2 id="fc-done-h" tabIndex={-1}><Icon name="success" size={22} /> {r.done}</h2>
        <p>{r.doneSummary(counts.good, counts.hard, counts.again)}</p>
        <p className="muted small">{r.declaration}</p>
        {offline && <p className="notice" role="status">{r.offline}</p>}
        <div className="fc-done-actions">
          {history.length > 0 && (
            <button type="button" className="btn" onClick={back}><Icon name="undo" size={18} /> {r.undo}</button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => onExit(updates)}>{r.close}</button>
        </div>
      </section>
    );
  }
  if (!card) return null;
  const currentRating = correcting?.cardId === card.id ? correcting.rating : null;
  return (
    <section className="fc" aria-labelledby="fc-q">
      <div className="fc-top">
        <button type="button" className="ib" aria-label={r.back} disabled={!history.length || !!correcting} onClick={back}><Icon name="back" size={20} /></button>
        <p className="fc-pos" aria-live="polite">{r.position(position + 1, queue.length)}</p>
        <button type="button" className="btn-link" onClick={stop}>{r.stop}</button>
      </div>
      <progress className="gt-progress fc-progress" max={queue.length} value={position} />
      {offline && <p className="fc-offline" role="status"><Icon name="cloud" size={16} /> {r.offline}</p>}
      {repeated && (
        <p className="notice" role="status">
          {r.repeated}{" "}
          <ReportLink href={`/rapports/${reportId}?a=${encodeURIComponent(byId.get(repeated)?.chapter_id ?? "")}`} immersive>{t.supports.map.inCourse}</ReportLink>
        </p>
      )}

      <article key={`${card.id}-${position}-${revealed ? "b" : "f"}`} className={`fc-card mm-c-${card.color}${revealed ? " is-back" : ""}`}>
        {!revealed ? (
          <>
            <h3 id="fc-q" ref={questionRef} tabIndex={-1} className="fc-question">{card.question}</h3>
            {figure(card.front_visual_id)}
            <p className="fc-think">{r.think}</p>
          </>
        ) : (
          <>
            <p className="fc-question-small" id="fc-q">{card.question}</p>
            <h3 ref={answerRef} tabIndex={-1} className="fc-answer"><span className="sr-only">{r.answer} : </span>{card.answer}</h3>
            {card.explanation && <p className="fc-expl">{card.explanation}</p>}
            {figure(card.back_visual_id)}
            <ReportLink href={`/rapports/${reportId}?a=${encodeURIComponent(card.chapter_id)}`} className="btn-link fc-course" immersive>
              <Icon name="book" size={16} /> {t.supports.map.inCourse}
            </ReportLink>
          </>
        )}
      </article>

      {!revealed ? (
        <button type="button" className="btn btn-primary btn-block fc-reveal" onClick={() => setRevealed(true)}>
          <Icon name="eye" size={18} /> {r.reveal}
        </button>
      ) : (
        <>
          <div className="fc-rates" role="group" aria-label={r.answer}>
            {(["again", "hard", "good"] as const).map((k) => (
              <button key={k} type="button" className={`fc-rate fc-rate-${k}${currentRating === k ? " is-current" : ""}`} aria-pressed={currentRating === k} onClick={() => rate(k)}>
                <b>{r[k]}</b>
                <small>{r[`${k}Hint`]}</small>
              </button>
            ))}
          </div>
          {correcting && (
            <button type="button" className="btn btn-block" onClick={skipCorrection}>{r.next}</button>
          )}
          <p className="muted small center">{r.declaration}</p>
        </>
      )}
    </section>
  );
}
