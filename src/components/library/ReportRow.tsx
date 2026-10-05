"use client";

import { walletChanged } from "@/components/billing/wallet-store";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { ReportLink } from "@/components/ReportLink";
import { toast } from "@/components/shell/Toasts";
import { useDialogHistory } from "@/components/shell/useDialogHistory";
import { apiMessage } from "@/lib/i18n/api";
import { useT } from "@/lib/i18n/client";
import { COVERS, coverView, type CoverView } from "@/lib/library/covers";
import { Cover } from "./Cover";

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
  favorite: boolean;
  cover: CoverView;
  sourceCount: number;
}

const LONG_PRESS = 500;
/** Déplacement du doigt au-delà duquel l'appui long est annulé (défilement). */
const MOVE_TOLERANCE = 10;

async function patch(id: string, body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`/api/reports/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  return !!res?.ok;
}

/** Statut toujours accompagné d'une icône et d'un libellé (jamais la couleur seule). */
export function StatusLabel({ state, sources }: { state: RowData["state"]; sources: number }) {
  const t = useT();
  const icon: IconName = state === "failed" ? "alert" : state === "running" ? "hourglass" : "check";
  const label = state === "failed" ? t.library.v2.interrupted : state === "running" ? t.library.v2.preparing : t.library.v2.ready;
  return (
    <span className={`status status-${state}`}>
      <Icon name={icon} />
      <span>{label}</span>
      <span aria-hidden="true">·</span>
      <span>{t.library.v2.sources(sources)}</span>
    </span>
  );
}

/**
 * Une leçon de la bibliothèque (LessonCard) : couverture 4:5 en grille, miniature en liste.
 * Favori et menu ⋯ (cibles 44 px) ; appui long, clic droit ou Maj+F10 ouvrent le même menu.
 * En sélection, toucher la carte la coche au lieu de l'ouvrir. En échec : Réessayer et Supprimer.
 */
export function ReportRow({
  row,
  variant = "grid",
  showFailure = false,
  selecting = false,
  selected = false,
  onToggle,
  onStartSelect,
  onMove,
  onOpen,
}: {
  row: RowData;
  variant?: "grid" | "list";
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
  const v = t.library.v2;
  const router = useRouter();
  const menu = useRef<HTMLDialogElement>(null);
  const covers = useRef<HTMLDialogElement>(null);
  const rename = useRef<HTMLDialogElement>(null);
  useDialogHistory(menu);
  useDialogHistory(covers);
  useDialogHistory(rename);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const pressed = useRef(false);
  const [busy, setBusy] = useState(false);
  const [favorite, setFavorite] = useState(row.favorite);
  const [cover, setCover] = useState(row.cover);
  const [title, setTitle] = useState(row.title);

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
    walletChanged();
    setBusy(false);
    if (!res?.ok) return toast(apiMessage(t, body, t.library.actionFailed), "error");
    toast(t.library.retried);
    router.push(`/rapports/${row.id}`);
  }

  async function toggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    if (!(await patch(row.id, { favorite: next }))) {
      setFavorite(!next);
      return toast(t.library.actionFailed, "error");
    }
    router.refresh();
  }

  async function chooseCover(id: (typeof COVERS)[number]) {
    covers.current?.close();
    const prev = cover;
    setCover(coverView(id));
    if (!(await patch(row.id, { cover_id: id }))) {
      setCover(prev);
      toast(t.library.actionFailed, "error");
    }
  }

  async function saveTitle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get("title") ?? "").trim();
    if (!value || value === title) return rename.current?.close();
    rename.current?.close();
    const prev = title;
    setTitle(value);
    if (!(await patch(row.id, { title: value }))) {
      setTitle(prev);
      return toast(t.library.actionFailed, "error");
    }
    router.refresh();
  }

  const openMenu = () => {
    if (menu.current && !menu.current.open) menu.current.showModal();
  };
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
        openMenu();
      }, LONG_PRESS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (origin.current && Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > MOVE_TOLERANCE) cancelPress();
    },
    onPointerUp: cancelPress,
    onPointerLeave: cancelPress,
    onPointerCancel: cancelPress,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      if (!selecting) openMenu();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (selecting) return;
      if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
        e.preventDefault();
        openMenu();
      }
    },
  };
  const swallowAfterPress = (e: React.MouseEvent) => {
    if (pressed.current) {
      e.preventDefault();
      e.stopPropagation();
      pressed.current = false;
      return;
    }
    onOpen?.();
  };

  const body = (
    <>
      <Cover cover={cover} className={variant === "grid" ? "lesson-cover" : "lesson-thumb"} />
      <span className="lesson-text">
        <b className="lesson-title">
          {title}
          {row.unread && <span className="unread-dot" role="img" aria-label={t.library.unread} />}
        </b>
        <StatusLabel state={row.state} sources={row.sourceCount} />
        {row.folderName && <small className="lesson-folder">{t.library.inFolder(row.folderName)}</small>}
      </span>
    </>
  );

  return (
    <li className={`lesson lesson-${variant} lesson-${row.state}${selected ? " is-selected" : ""}`}>
      <div className="lesson-main" {...press}>
      {selecting ? (
        <label className="lesson-hit">
          <input type="checkbox" className="lesson-check" checked={selected} onChange={() => onToggle?.(row.id)} aria-label={t.library.selectItem(title)} />
          {body}
        </label>
      ) : (
        <ReportLink href={row.state === "ready" ? `/rapports/${row.id}/apercu` : `/rapports/${row.id}`} className="lesson-hit">
          <span className="lesson-hit-inner" onClickCapture={swallowAfterPress}>{body}</span>
        </ReportLink>
      )}
      {!selecting && (
        <div className="lesson-actions">
          {row.state === "ready" && (
            <button type="button" className="ib ib-round lesson-fav" aria-pressed={favorite} aria-label={favorite ? v.unfavorite(title) : v.favorite(title)} onClick={toggleFavorite}>
              <Icon name="heart" size={22} className={favorite ? "is-on" : undefined} />
            </button>
          )}
          <button type="button" className="ib ib-round lesson-more" aria-haspopup="dialog" aria-label={t.library.actionsFor(title)} onClick={openMenu}>
            <Icon name="more" size={22} />
          </button>
        </div>
      )}
      </div>
      {showFailure && !selecting && (
        <div className="lesson-failure">
          {row.reason && <p className="muted small">{row.reason}</p>}
          <p className="muted small">{v.sourcesKept}</p>
          <div className="actions-row">
            <button type="button" className={`btn btn-primary${busy ? " busy" : ""}`} disabled={busy} onClick={retry}>
              {busy ? t.library.retrying : t.library.retry}
            </button>
            <a href={`/rapports/${row.id}`} className="btn">{v.details}</a>
          </div>
        </div>
      )}

      <dialog ref={menu} className="sheet side" aria-labelledby={`m-${row.id}`}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id={`m-${row.id}`}>{title}</h2>
          <button type="button" className="ib" aria-label={t.reader.close} onClick={() => menu.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        <ul className="rows">
          <li>
            <button type="button" className="row" onClick={() => { menu.current?.close(); router.push(row.state === "ready" ? `/rapports/${row.id}/apercu` : `/rapports/${row.id}`); }}>
              <span className="row-icon"><Icon name="book" /></span>
              <span className="row-text"><b>{t.library.open}</b></span>
            </button>
          </li>
          {row.state === "ready" && (
            <li>
              <button type="button" className="row" onClick={() => { menu.current?.close(); void toggleFavorite(); }}>
                <span className="row-icon"><Icon name="heart" /></span>
                <span className="row-text"><b>{favorite ? v.removeFavorite : v.addFavorite}</b></span>
              </button>
            </li>
          )}
          <li>
            <button type="button" className="row" onClick={() => { menu.current?.close(); rename.current?.showModal(); }}>
              <span className="row-icon"><Icon name="pencil" /></span>
              <span className="row-text"><b>{v.rename}</b></span>
            </button>
          </li>
          <li>
            <button type="button" className="row" onClick={() => { menu.current?.close(); covers.current?.showModal(); }}>
              <span className="row-icon"><Icon name="grid" /></span>
              <span className="row-text"><b>{v.changeCover}</b><small>{v.coverNote}</small></span>
            </button>
          </li>
          <li>
            <button type="button" className="row" onClick={() => { menu.current?.close(); onMove?.(row.id); }}>
              <span className="row-icon"><Icon name="move" /></span>
              <span className="row-text"><b>{t.library.moveTo}</b></span>
              <Icon name="chevron" className="row-chevron" />
            </button>
          </li>
          <li>
            <button type="button" className="row" onClick={() => { menu.current?.close(); onStartSelect?.(row.id); }}>
              <span className="row-icon"><Icon name="check" /></span>
              <span className="row-text"><b>{t.library.select}</b></span>
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

      <dialog ref={covers} className="sheet center" aria-labelledby={`c-${row.id}`}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id={`c-${row.id}`}>{v.changeCover}</h2>
          <button type="button" className="ib" aria-label={t.reader.close} onClick={() => covers.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        <p className="muted small">{v.coverNote}</p>
        <div className="cover-picker" role="radiogroup" aria-label={v.changeCover}>
          {COVERS.map((id) => (
            <button key={id} type="button" role="radio" aria-checked={cover.id === id} aria-label={v.coverNames[id] ?? id} className="cover-choice" onClick={() => chooseCover(id)}>
              <Cover cover={coverView(id)} />
              <span>{v.coverNames[id] ?? id}</span>
            </button>
          ))}
        </div>
      </dialog>

      <dialog ref={rename} className="sheet center" aria-labelledby={`r-${row.id}`}>
        <div className="sheet-grip" aria-hidden="true" />
        <form onSubmit={saveTitle}>
          <div className="sheet-head">
            <h2 id={`r-${row.id}`}>{v.rename}</h2>
            <button type="button" className="ib" aria-label={t.reader.close} onClick={() => rename.current?.close()}>
              <Icon name="close" />
            </button>
          </div>
          <label htmlFor={`rt-${row.id}`}>{v.titleLabel}</label>
          <input id={`rt-${row.id}`} name="title" type="text" defaultValue={title} maxLength={160} required />
          <button type="submit" className="btn btn-primary btn-block">{v.save}</button>
        </form>
      </dialog>
    </li>
  );
}
