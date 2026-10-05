"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/shell/Toasts";
import { useDialogHistory } from "@/components/shell/useDialogHistory";
import { apiMessage } from "@/lib/i18n/api";
import { useT } from "@/lib/i18n/client";

interface Folder {
  id: string;
  name: string;
}

async function move(ids: string[], folderId: string | null, expect?: string | null) {
  const res = await fetch("/api/library/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report_ids: ids, folder_id: folderId, ...(expect !== undefined ? { expect_folder_id: expect } : {}) }),
  }).catch(() => null);
  const body = await res?.json().catch(() => ({}));
  return { ok: !!res?.ok, body: body as { moved?: string[]; skipped?: string[]; previous?: Record<string, string | null>; error?: string; message?: string } };
}

/**
 * « Déplacer vers… » (V5, § 8) : Bibliothèque ou un dossier, création d'un dossier sans perdre
 * la sélection, confirmation « Déplacer ». Le succès n'est annoncé qu'après réponse du
 * serveur ; « Annuler » ne remet en place que les Limpid encore dans le dossier choisi.
 */
export function MovePanel({
  open,
  ids,
  currentFolderIds,
  folders,
  onClose,
  onDone,
}: {
  open: boolean;
  ids: string[];
  /** Dossiers actuels des Limpid sélectionnés (destination inutile si tous y sont déjà). */
  currentFolderIds: (string | null)[];
  folders: Folder[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const base = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useDialogHistory(ref);
  const [list, setList] = useState(folders);
  const [target, setTarget] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const same = new Set(currentFolderIds);
  const current = same.size === 1 ? [...same][0] : undefined;

  useEffect(() => setList(folders), [folders]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setTarget(undefined);
      setName("");
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  async function createFolder() {
    const n = name.trim();
    if (!n) return;
    setCreating(true);
    const res = await fetch("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setCreating(false);
    if (!res?.ok) return toast(apiMessage(t, body, t.library.actionFailed), "error");
    setList((l) => [...l, { id: body.id, name: body.name }]);
    setTarget(body.id);
    setName("");
  }

  async function confirm() {
    if (target === undefined) return;
    setBusy(true);
    const { ok, body } = await move(ids, target);
    setBusy(false);
    if (!ok || !body.moved) return toast(apiMessage(t, body, t.library.actionFailed), "error");
    const destName = target === null ? t.library.backToLibrary : (list.find((f) => f.id === target)?.name ?? "");
    const moved = body.moved;
    const previous = body.previous ?? {};
    onDone();
    router.refresh();
    if (body.skipped?.length) toast(t.library.partialMove(body.skipped.length), "error");
    if (moved.length) {
      toast(t.library.movedTo(destName, moved.length), "ok", {
        label: t.library.undo,
        run: async () => {
          // Chaque Limpid revient dans son dossier d'origine, s'il n'a pas été déplacé depuis.
          const groups = new Map<string | null, string[]>();
          for (const id of moved) groups.set(previous[id] ?? null, [...(groups.get(previous[id] ?? null) ?? []), id]);
          let failed = false;
          for (const [from, group] of groups) failed = !(await move(group, from, target)).ok || failed;
          toast(failed ? t.library.actionFailed : t.library.undone, failed ? "error" : "ok");
          router.refresh();
        },
      });
    }
  }

  return (
    <dialog ref={ref} className="sheet side move-panel" aria-labelledby={`${base}-h`} onClose={onClose}>
      <div className="sheet-grip" aria-hidden="true" />
      <div className="sheet-head">
        <h2 id={`${base}-h`}>{t.library.movePanelTitle(ids.length)}</h2>
        <button type="button" className="ib" aria-label={t.reader.close} onClick={() => ref.current?.close()}>
          <Icon name="close" />
        </button>
      </div>
      <fieldset className="choices move-dest" disabled={busy}>
        <legend className="sr-only">{t.library.moveTitle}</legend>
        {[{ id: null as string | null, name: t.library.noFolder }, ...list].map((f) => {
          const isCurrent = current !== undefined && f.id === current;
          return (
            <label key={f.id ?? "root"} className={`choice${isCurrent ? " is-current" : ""}`}>
              <input type="radio" name={`${base}-dest`} checked={target === f.id} disabled={isCurrent} onChange={() => setTarget(f.id)} />
              <Icon name={f.id ? "folder" : "home"} size={18} />
              <span>
                {f.name}
                {isCurrent && <small className="muted"> · {t.library.currentFolder}</small>}
              </span>
            </label>
          );
        })}
      </fieldset>
      <div className="move-new">
        <label htmlFor={`${base}-new`}>{t.library.newFolder}</label>
        <div className="move-new-row">
          <input
            id={`${base}-new`}
            value={name}
            maxLength={80}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void createFolder();
              }
            }}
          />
          <button type="button" className={`btn${creating ? " busy" : ""}`} disabled={!name.trim() || creating} onClick={createFolder}>
            <Icon name="folder-plus" /> {t.library.create}
          </button>
        </div>
      </div>
      <button type="button" className={`btn btn-primary btn-block${busy ? " busy" : ""}`} disabled={target === undefined || busy} onClick={confirm}>
        {busy ? t.library.moving : t.library.moveConfirm}
      </button>
    </dialog>
  );
}
