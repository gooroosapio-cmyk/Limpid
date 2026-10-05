"use client";

import { useActionState, useId } from "react";
import { deleteMyAccount, type DeleteAccountState } from "@/app/preferences/account-actions";
import { useT } from "@/lib/i18n/client";

/** Zone de suppression du compte : liste de ce qui est effacé et confirmation écrite. */
export function DeleteAccount() {
  const t = useT();
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(deleteMyAccount, { error: null });
  const base = useId();
  return (
    <details className="danger-zone account-delete">
      <summary>{t.account.deleteTitle}</summary>
      <p>{t.account.deleteIntro}</p>
      <ul>{t.account.deleteItems.map((i) => <li key={i}>{i}</li>)}</ul>
      <p className="muted">{t.account.deleteKeep}</p>
      <form action={action}>
        <label htmlFor={`${base}-confirm`}>{t.account.confirmLabel}</label>
        <input id={`${base}-confirm`} name="confirm" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} required />
        {state.error && <p className="notice notice-warn" role="alert">{state.error}</p>}
        <button type="submit" className="btn btn-block btn-danger" disabled={pending}>
          {pending ? t.account.deleting : t.account.deleteButton}
        </button>
      </form>
    </details>
  );
}
