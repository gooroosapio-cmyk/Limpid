"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ActionMenu } from "@/components/shell/ActionMenu";
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

/**
 * Menu « … » du dossier sélectionné : renommer, supprimer. Supprimer retire seulement le
 * classement : les cours du dossier restent dans la bibliothèque générale (dit dans la confirmation).
 */
export function FolderActions({ id, name, count, clearHref }: { id: string; name: string; count: number; clearHref: string }) {
  const t = useT();
  const f = t.fluid.folders;
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const del = useRef<HTMLDialogElement>(null);
  useDialogHistory(del);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/folders/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast(t.library.actionFailed, "error");
    del.current?.close();
    toast(f.deleted(name));
    router.push(clearHref, { scroll: false });
    router.refresh();
  }

  return (
    <>
      <ActionMenu
        label={f.actions(name)}
        items={[
          { label: t.library.rename, icon: "pencil", onSelect: () => ref.current?.showModal() },
          { label: t.library.deleteFolder, icon: "trash", danger: true, onSelect: () => del.current?.showModal() },
        ]}
      />
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
      <dialog ref={del} className="sheet center" aria-labelledby="folder-del-h" aria-describedby="folder-del-d">
        <div className="sheet-head">
          <h2 id="folder-del-h">{f.deleteTitle(name)}</h2>
          <button type="button" className="ib" aria-label={t.reader.close} onClick={() => del.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        <p id="folder-del-d">{f.deleteKeeps(count)}</p>
        <div className="actions-row">
          <button type="button" className="btn" onClick={() => del.current?.close()}>{t.library.cancel}</button>
          <button type="button" className={`btn btn-danger${busy ? " busy" : ""}`} disabled={busy} onClick={remove}>{f.deleteCta}</button>
        </div>
      </dialog>
    </>
  );
}
