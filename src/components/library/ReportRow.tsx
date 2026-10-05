"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { ReportLink } from "@/components/ReportLink";
import { toast } from "@/components/shell/Toasts";
import { useDialogHistory } from "@/components/shell/useDialogHistory";
import { apiMessage } from "@/lib/i18n/api";
import { useT } from "@/lib/i18n/client";

export interface RowData {
  id: string;
  title: string;
  sub: string;
  state: "ready" | "running" | "failed";
  unread: boolean;
  folderId: string | null;
  /** Nom du dossier (résultats de recherche dans toute la bibliothèque). */
  folderName?: string | null;
  /** Explication de l'échec (filtre Échecs). */
  reason?: string;
}

const LONG_PRESS = 500;
/** Déplacement du doigt au-delà duquel l'appui long est annulé (défilement). */
const MOVE_TOLERANCE = 10;

/**
 * Un Limpid de la bibliothèque. Appui long : mode sélection. Bouton ⋯ : Ouvrir, Sélectionner,
 * Déplacer vers…, Supprimer. En sélection, toucher la ligne la coche au lieu de l'ouvrir.
 * En échec : explication, Réessayer et Supprimer.
 */
export function ReportRow({
  row,
  showFailure = false,
  selecting = false,
  selected = false,
  onToggle,
  onStartSelect,
  onMove,
  onOpen,
}: {
  row: RowData;
  showFailure?: boolean;
  selecting?: boolean;
  selected?: boolean;
  onToggle?: (id: string) => void;
  onStartSelect?: (id: string) => void;
  onMove?: (id: string) => void;
  /** Ouverture d'un résultat (mémorise la recherche utilisée). */
  onOpen?: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const menu = useRef<HTMLDialogElement>(null);
  useDialogHistory(menu);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const pressed = useRef(false);
  const [busy, setBusy] = useState(false);
  const icon: IconName = row.state === "failed" ? "alert" : row.state === "running" ? "hourglass" : "book";
  const cls = row.state === "failed" ? "row error" : row.state === "running" ? "row running" : "row";

  async function remove() {
    menu.current?.close();
    if (!window.confirm(t.library.deleteConfirm)) return;
    const res = await fetch(`/api/reports/${row.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return toast(t.library.actionFailed, "error");
    router.refresh();
  }

  async function retry() {
    setBusy(true);
    const res = await fetch(`/api/reports/${row.id}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotency_key: crypto.randomUUID() }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) return toast(apiMessage(t, body, t.library.actionFailed), "error");
    toast(t.library.retried);
    router.push(`/rapports/${row.id}`);
  }

  const cancelPress = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };
  const press = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" || selecting) return;
      pressed.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        pressed.current = true;
        navigator.vibrate?.(10);
        // Le relâchement du doigt produit un clic : il ne doit rien ouvrir.
        const swallow = (ev: Event) => {
          ev.preventDefault();
          ev.stopPropagation();
        };
        document.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 800);
        onStartSelect?.(row.id);
      }, LONG_PRESS);
    },
    // Le défilement annule l'appui long avant son déclenchement.
    onPointerMove: (e: React.PointerEvent) => {
      if (origin.current && Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > MOVE_TOLERANCE) cancelPress();
    },
    onPointerUp: cancelPress,
    onPointerLeave: cancelPress,
    onPointerCancel: cancelPress,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  const text = (
    <span className="row-text">
      <b>
        {row.title}
        {row.unread && <span className="unread-dot" role="img" aria-label={t.library.unread} />}
      </b>
      <small>
        {row.sub}
        {row.folderName ? ` · ${t.library.inFolder(row.folderName)}` : ""}
      </small>
    </span>
  );

  return (
    <li className={`lib-row${showFailure ? " lib-failure" : ""}${selected ? " is-selected" : ""}`}>
      <div className="lib-row-main" {...press}>
        {selecting ? (
          <label className={`${cls} lib-select`}>
            <input type="checkbox" checked={selected} onChange={() => onToggle?.(row.id)} aria-label={t.library.selectItem(row.title)} />
            <span className="row-icon" aria-hidden="true"><Icon name={selected ? "check" : icon} /></span>
            {text}
          </label>
        ) : (
          <ReportLink href={`/rapports/${row.id}`} className={cls} immersive={row.state === "ready"}>
            <span
              className="row-icon"
              onClickCapture={(e) => {
                if (pressed.current) {
                  e.preventDefault();
                  e.stopPropagation();
                  pressed.current = false;
                }
              }}
            >
              <Icon name={icon} />
            </span>
            <span
              className="lib-row-hit"
              onClickCapture={(e) => {
                if (pressed.current) {
                  e.preventDefault();
                  e.stopPropagation();
                  pressed.current = false;
                  return;
                }
                onOpen?.();
              }}
            >
              {text}
            </span>
          </ReportLink>
        )}
        {!selecting && (
          <button type="button" className="ib lib-more" aria-haspopup="dialog" aria-label={t.library.actionsFor(row.title)} onClick={() => menu.current?.showModal()}>
            <Icon name="more" />
          </button>
        )}
      </div>
      {showFailure && !selecting && (
        <div className="lib-failure-body">
          {row.reason && <p className="muted small">{row.reason}</p>}
          <div className="actions-row">
            <button type="button" className={`btn btn-primary${busy ? " busy" : ""}`} disabled={busy} onClick={retry}>
              <Icon name="refresh" /> {busy ? t.library.retrying : t.library.retry}
            </button>
            <button type="button" className="btn" onClick={remove}>
              <Icon name="trash" /> {t.library.delete}
            </button>
          </div>
        </div>
      )}

      <dialog ref={menu} className="sheet side" aria-labelledby={`m-${row.id}`}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id={`m-${row.id}`}>{row.title}</h2>
          <button type="button" className="ib" aria-label={t.reader.close} onClick={() => menu.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        <ul className="rows">
          <li>
            <button type="button" className="row" onClick={() => { menu.current?.close(); router.push(`/rapports/${row.id}`); }}>
              <span className="row-icon"><Icon name="book" /></span>
              <span className="row-text"><b>{t.library.open}</b></span>
            </button>
          </li>
          <li>
            <button type="button" className="row" onClick={() => { menu.current?.close(); onStartSelect?.(row.id); }}>
              <span className="row-icon"><Icon name="check" /></span>
              <span className="row-text"><b>{t.library.select}</b></span>
            </button>
          </li>
          <li>
            <button type="button" className="row" onClick={() => { menu.current?.close(); onMove?.(row.id); }}>
              <span className="row-icon"><Icon name="move" /></span>
              <span className="row-text"><b>{t.library.moveTo}</b></span>
              <Icon name="chevron" className="row-chevron" />
            </button>
          </li>
          {row.state === "failed" && (
            <li>
              <button type="button" className="row" onClick={() => { menu.current?.close(); void retry(); }}>
                <span className="row-icon"><Icon name="refresh" /></span>
                <span className="row-text"><b>{t.library.retry}</b></span>
              </button>
            </li>
          )}
          <li>
            <button type="button" className="row row-danger" onClick={remove}>
              <span className="row-icon"><Icon name="trash" /></span>
              <span className="row-text"><b>{t.library.delete}</b></span>
            </button>
          </li>
        </ul>
      </dialog>
    </li>
  );
}
