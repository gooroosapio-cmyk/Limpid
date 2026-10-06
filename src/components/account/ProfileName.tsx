"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateDisplayName } from "@/app/compte/actions";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/shell/Toasts";
import { useDialogHistory } from "@/components/shell/useDialogHistory";
import { useT } from "@/lib/i18n/client";
import { initials } from "@/lib/initials";

/** Identité du profil : initiales, nom affiché (ou « Mon profil »), crayon pour le modifier. */
export function ProfileName({ name, email, sub }: { name: string | null; email: string; sub: string }) {
  const t = useT();
  const p = t.profile;
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  useDialogHistory(dialog);
  const [current, setCurrent] = useState(name);
  return (
    <div className="profile-id">
      <span className="avatar avatar-xl" aria-hidden="true">{initials(current, email)}</span>
      <div className="profile-id-text">
        <h2>{current || p.me}</h2>
        <p>{sub}</p>
      </div>
      <button type="button" className="ib profile-edit" aria-label={p.editName} onClick={() => dialog.current?.showModal()}>
        <Icon name="pencil" />
      </button>
      <dialog ref={dialog} className="sheet center" aria-labelledby="name-h">
        <div className="sheet-grip" aria-hidden="true" />
        <form
          action={async (form) => {
            const value = String(form.get("name") ?? "").trim();
            dialog.current?.close();
            const res = await updateDisplayName(form);
            if (!res.ok) return toast(t.library.actionFailed, "error");
            setCurrent(value || null);
            router.refresh();
          }}
        >
          <div className="sheet-head">
            <h2 id="name-h">{p.editName}</h2>
            <button type="button" className="ib" aria-label={t.reader.close} onClick={() => dialog.current?.close()}>
              <Icon name="close" />
            </button>
          </div>
          <label htmlFor="display-name">{p.nameLabel}</label>
          <input id="display-name" name="name" type="text" defaultValue={current ?? ""} maxLength={40} autoComplete="given-name" />
          <p className="muted small">{p.nameHelp}</p>
          <button type="submit" className="btn btn-primary btn-block">{t.library.v2.save}</button>
        </form>
      </dialog>
    </div>
  );
}
