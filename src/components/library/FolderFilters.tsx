"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/shell/Toasts";
import { useDialogHistory } from "@/components/shell/useDialogHistory";
import { useT } from "@/lib/i18n/client";

/**
 * Dossiers = filtres (prompt « Fluidité », § 5, planche 02) : une bande compacte ; toucher un
 * dossier filtre la liste juste en dessous, sur le même écran (adresse ?dossier=…, retour cohérent).
 */
export function FolderFilterBar({ folders, active, hrefFor, allHref }: { folders: { id: string; name: string; count: number }[]; active: string | null; hrefFor: Record<string, string>; allHref: string }) {
  const t = useT();
  const bar = useRef<HTMLElement>(null);
  // Dossier actif toujours visible dans la bande (sans faire défiler la page).
  useEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>('[aria-current="true"]');
    if (el && bar.current) bar.current.scrollLeft = Math.max(0, el.offsetLeft - 16);
  }, [active]);
  return (
    <nav ref={bar} className="ff-bar" aria-label={t.fluid.folders.label}>
      <ul>
        <li>
          <Link href={allHref} scroll={false} className="ff-chip" aria-current={!active ? "true" : undefined}>
            <Icon name="folder" size={18} /> <span>{t.fluid.folders.all}</span>
          </Link>
        </li>
        {folders.map((f) => (
          <li key={f.id}>
            <Link href={hrefFor[f.id]!} scroll={false} className="ff-chip" aria-current={active === f.id ? "true" : undefined}>
              <Icon name="folder" size={18} /> <span>{f.name}</span> <span className="ff-count">· {f.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Contexte du filtre actif : « Dossier : Cours », menu « … » et croix pour retirer le filtre. */
export function FolderContext({ name, clearHref, actions }: { name: string; clearHref: string; actions: React.ReactNode }) {
  const t = useT();
  return (
    <div className="ff-context">
      <p><span className="ff-context-label">{t.fluid.folders.context}</span> <b>{name}</b></p>
      <div className="ff-context-tools">
        {actions}
        <span className="ff-sep" aria-hidden="true" />
        <Link href={clearHref} scroll={false} className="icon-button" aria-label={t.fluid.folders.clear}>
          <Icon name="close" size={20} />
        </Link>
      </div>
    </div>
  );
}

/**
 * Dossier réellement vide : bloc compact sous le titre de liste. « Déplacer un cours » n'est
 * proposé que s'il existe des cours ailleurs ; le nouvel import est rangé dans ce dossier.
 */
export function EmptyFolderState({ folderId, others, allHref }: { folderId: string; others: { id: string; title: string }[]; allHref: string }) {
  const t = useT();
  const f = t.fluid.folders;
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  useDialogHistory(dlg);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  async function move() {
    if (!picked.size || busy) return;
    setBusy(true);
    const res = await fetch("/api/library/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report_ids: [...picked], folder_id: folderId }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast(t.library.actionFailed, "error");
    dlg.current?.close();
    setPicked(new Set());
    router.refresh();
  }

  return (
    <section className="ff-empty" aria-labelledby="ff-empty-h">
      <span className="ff-empty-icon" aria-hidden="true"><Icon name="folder" size={40} /></span>
      <h3 id="ff-empty-h">{f.emptyTitle}</h3>
      <p className="muted">{others.length ? f.emptyText : f.emptyTextNoOther}</p>
      <div className="fl-actions">
        <Link href={`/?ranger=${folderId}`} className="btn btn-primary btn-block">{f.add}</Link>
        {others.length > 0 && (
          <button type="button" className="btn btn-block" aria-haspopup="dialog" onClick={() => dlg.current?.showModal()}>{f.move}</button>
        )}
      </div>
      <Link href={allHref} scroll={false} className="btn-link ff-all">{f.seeAll} <Icon name="chevron" size={16} /></Link>
      <dialog ref={dlg} className="sheet center" aria-labelledby="ff-move-h">
        <div className="sheet-head">
          <h2 id="ff-move-h">{f.moveTitle}</h2>
          <button type="button" className="ib" aria-label={t.reader.close} onClick={() => dlg.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        <ul className="ff-pick">
          {others.map((o) => (
            <li key={o.id}>
              <label>
                <input
                  type="checkbox"
                  checked={picked.has(o.id)}
                  onChange={() =>
                    setPicked((s) => {
                      const n = new Set(s);
                      if (n.has(o.id)) n.delete(o.id);
                      else n.add(o.id);
                      return n;
                    })
                  }
                />
                <span>{o.title}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="actions-row">
          <button type="button" className="btn" onClick={() => dlg.current?.close()}>{t.library.cancel}</button>
          <button type="button" className={`btn btn-primary${busy ? " busy" : ""}`} disabled={!picked.size || busy} onClick={move}>{f.moveHere(picked.size)}</button>
        </div>
      </dialog>
    </section>
  );
}

/** Filtres ou recherche qui excluent des cours existants : ce n'est pas un dossier vide. */
export function NoMatchState({ resetHref }: { resetHref: string }) {
  const t = useT();
  return (
    <div className="ff-nomatch" role="status">
      <p>{t.fluid.folders.noMatch}</p>
      <Link href={resetHref} scroll={false} className="btn">{t.fluid.folders.reset}</Link>
    </div>
  );
}
