"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/shell/Toasts";
import { useDialogHistory } from "@/components/shell/useDialogHistory";
import { apiMessage } from "@/lib/i18n/api";
import { useT } from "@/lib/i18n/client";

function NameDialog({
  dialogRef,
  title,
  initial,
  submit,
  onSubmit,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  title: string;
  initial: string;
  submit: string;
  onSubmit: (name: string) => Promise<boolean>;
}) {
  const t = useT();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  useDialogHistory(dialogRef);
  return (
    <dialog ref={dialogRef} className="sheet center" aria-labelledby="folder-dlg-h" onClose={() => setName(initial)}>
      <div className="sheet-grip" aria-hidden="true" />
      <div className="sheet-head">
        <h2 id="folder-dlg-h">{title}</h2>
        <button type="button" className="ib" aria-label={t.reader.close} onClick={() => dialogRef.current?.close()}>
          <Icon name="close" />
        </button>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const n = name.trim();
          if (!n) return;
          setBusy(true);
          const ok = await onSubmit(n);
          setBusy(false);
          if (ok) dialogRef.current?.close();
        }}
      >
        <label htmlFor="folder-name">{t.library.folderName}</label>
        <input id="folder-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" required />
        <div className="actions-row">
          <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>{t.library.cancel}</button>
          <button type="submit" className={`btn btn-primary${busy ? " busy" : ""}`} disabled={busy || !name.trim()}>{submit}</button>
        </div>
      </form>
    </dialog>
  );
}

/** « Nouveau dossier » (bibliothèque ; aussi ouvert depuis le menu par ?nouveau-dossier=1). */
export function NewFolder({ iconOnly = false }: { iconOnly?: boolean }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (search.get("nouveau-dossier") !== "1") return;
    const sp = new URLSearchParams(search.toString());
    sp.delete("nouveau-dossier");
    const s = sp.toString();
    router.replace(s ? `${pathname}?${s}` : pathname);
    ref.current?.showModal();
  }, [search, pathname, router]);

  return (
    <>
      {iconOnly ? (
        <button type="button" className="icon-button lib-newfolder-icon" aria-haspopup="dialog" aria-label={t.library.newFolder} onClick={() => ref.current?.showModal()}>
          <Icon name="folder-plus" size={20} />
        </button>
      ) : (
        <button type="button" className="btn lib-newfolder" aria-haspopup="dialog" onClick={() => ref.current?.showModal()}>
          <Icon name="folder-plus" /> {t.library.newFolder}
        </button>
      )}
      <NameDialog
        dialogRef={ref}
        title={t.library.newFolder}
        initial=""
        submit={t.library.create}
        onSubmit={async (name) => {
          const res = await fetch("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }).catch(() => null);
          const body = await res?.json().catch(() => ({}));
          if (!res?.ok) {
            toast(apiMessage(t, body, t.library.actionFailed), "error");
            return false;
          }
          router.refresh();
          return true;
        }}
      />
    </>
  );
}

/** Actions d'un dossier ouvert : renommer, supprimer (ses Limpid gardés par défaut). */
export function FolderActions({ id, name, count }: { id: string; name: string; count: number }) {
  const t = useT();
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const del = useRef<HTMLDialogElement>(null);
  useDialogHistory(del);
  const [busy, setBusy] = useState(false);

  async function remove(withReports: boolean) {
    if (withReports && !window.confirm(t.library.deleteAllConfirm(count))) return;
    setBusy(true);
    const res = await fetch(`/api/folders/${id}${withReports ? "?avec_limpid=1" : ""}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast(t.library.actionFailed, "error");
    del.current?.close();
    router.push("/bibliotheque");
    router.refresh();
  }

  return (
    <div className="folder-actions">
      <button type="button" className="btn-link" aria-haspopup="dialog" onClick={() => ref.current?.showModal()}>
        {t.library.rename}
      </button>
      <button type="button" className="btn-link danger" aria-haspopup="dialog" onClick={() => del.current?.showModal()}>
        {t.library.deleteFolder}
      </button>
      <NameDialog
        dialogRef={ref}
        title={t.library.renameFolder}
        initial={name}
        submit={t.library.rename}
        onSubmit={async (n) => {
          const res = await fetch(`/api/folders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) }).catch(() => null);
          if (!res?.ok) {
            toast(t.library.actionFailed, "error");
            return false;
          }
          router.refresh();
          return true;
        }}
      />
      <dialog ref={del} className="sheet side" aria-labelledby="folder-del-h">
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id="folder-del-h">{t.library.deleteFolderTitle}</h2>
          <button type="button" className="ib" aria-label={t.reader.close} onClick={() => del.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        <ul className="rows">
          <li>
            <button type="button" className="row" disabled={busy} onClick={() => remove(false)}>
              <span className="row-icon"><Icon name="folder" /></span>
              <span className="row-text"><b>{t.library.deleteFolderKeep}</b><small>{t.library.deleteFolderKeepSub}</small></span>
            </button>
          </li>
          {count > 0 && (
            <li>
              <button type="button" className="row row-danger" disabled={busy} onClick={() => remove(true)}>
                <span className="row-icon"><Icon name="trash" /></span>
                <span className="row-text"><b>{t.library.deleteFolderAll(count)}</b><small>{t.library.deleteFolderAllSub}</small></span>
              </button>
            </li>
          )}
        </ul>
      </dialog>
    </div>
  );
}
