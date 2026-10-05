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
  /** Explication de l'échec (filtre Échecs). */
  reason?: string;
}

const LONG_PRESS = 500;

/**
 * Un Limpid de la bibliothèque. Appui long (ou bouton ⋯) : Ouvrir, Déplacer vers…, Supprimer.
 * En échec : explication, Réessayer et Supprimer.
 */
export function ReportRow({ row, folders, showFailure = false }: { row: RowData; folders: { id: string; name: string }[]; showFailure?: boolean }) {
  const t = useT();
  const router = useRouter();
  const menu = useRef<HTMLDialogElement>(null);
  const move = useRef<HTMLDialogElement>(null);
  useDialogHistory(menu);
  useDialogHistory(move);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  async function moveTo(folderId: string | null, name: string) {
    move.current?.close();
    const res = await fetch(`/api/reports/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_id: folderId }) }).catch(() => null);
    if (!res?.ok) return toast(t.library.actionFailed, "error");
    toast(t.library.moved(name));
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

  const startPress = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    pressed.current = false;
    timer.current = setTimeout(() => {
      pressed.current = true;
      navigator.vibrate?.(10);
      menu.current?.showModal();
    }, LONG_PRESS);
  };
  const cancelPress = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const sheetHead = (id: string, title: string, ref: React.RefObject<HTMLDialogElement | null>) => (
    <>
      <div className="sheet-grip" aria-hidden="true" />
      <div className="sheet-head">
        <h2 id={id}>{title}</h2>
        <button type="button" className="ib" aria-label={t.reader.close} onClick={() => ref.current?.close()}>
          <Icon name="close" />
        </button>
      </div>
    </>
  );

  return (
    <li className={showFailure ? "lib-row lib-failure" : "lib-row"}>
      <div className="lib-row-main">
        <ReportLink href={`/rapports/${row.id}`} className={cls} immersive={row.state === "ready"}>
          <span
            className="row-icon"
            onPointerDown={startPress}
            onPointerUp={cancelPress}
            onPointerLeave={cancelPress}
            onPointerCancel={cancelPress}
          >
            <Icon name={icon} />
          </span>
          <span
            className="row-text"
            onPointerDown={startPress}
            onPointerUp={cancelPress}
            onPointerLeave={cancelPress}
            onPointerCancel={cancelPress}
            onClickCapture={(e) => {
              if (pressed.current) {
                e.preventDefault();
                e.stopPropagation();
                pressed.current = false;
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <b>
              {row.title}
              {row.unread && (
                <span className="unread-dot" role="img" aria-label={t.library.unread} />
              )}
            </b>
            <small>{row.sub}</small>
          </span>
        </ReportLink>
        <button type="button" className="ib lib-more" aria-haspopup="dialog" aria-label={t.library.actionsFor(row.title)} onClick={() => menu.current?.showModal()}>
          <Icon name="more" />
        </button>
      </div>
      {showFailure && (
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
        {sheetHead(`m-${row.id}`, row.title, menu)}
        <ul className="rows">
          <li>
            <button type="button" className="row" onClick={() => { menu.current?.close(); router.push(`/rapports/${row.id}`); }}>
              <span className="row-icon"><Icon name="book" /></span>
              <span className="row-text"><b>{t.library.open}</b></span>
            </button>
          </li>
          <li>
            <button type="button" className="row" onClick={() => { menu.current?.close(); move.current?.showModal(); }}>
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

      <dialog ref={move} className="sheet side" aria-labelledby={`mv-${row.id}`}>
        {sheetHead(`mv-${row.id}`, t.library.moveTitle, move)}
        <ul className="rows">
          <li>
            <button type="button" className="row" aria-current={row.folderId === null ? "true" : undefined} onClick={() => moveTo(null, t.library.backToLibrary)}>
              <span className="row-icon"><Icon name={row.folderId === null ? "check" : "home"} /></span>
              <span className="row-text"><b>{t.library.noFolder}</b></span>
            </button>
          </li>
          {folders.map((f) => (
            <li key={f.id}>
              <button type="button" className="row" aria-current={row.folderId === f.id ? "true" : undefined} onClick={() => moveTo(f.id, f.name)}>
                <span className="row-icon"><Icon name={row.folderId === f.id ? "check" : "folder"} /></span>
                <span className="row-text"><b>{f.name}</b></span>
              </button>
            </li>
          ))}
        </ul>
      </dialog>
    </li>
  );
}
