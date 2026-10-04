"use client";

import { useActionState, useId } from "react";
import { deleteMyAccount, type DeleteAccountState } from "@/app/preferences/account-actions";
import { fr } from "@/lib/i18n/fr";

/** Zone de suppression du compte : liste de ce qui est effacé et confirmation écrite. */
export function DeleteAccount() {
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(deleteMyAccount, { error: null });
  const base = useId();
  return (
    <details className="danger-zone account-delete">
      <summary>{fr.account.deleteTitle}</summary>
      <p>{fr.account.deleteIntro}</p>
      <ul>{fr.account.deleteItems.map((i) => <li key={i}>{i}</li>)}</ul>
      <p className="muted">{fr.account.deleteKeep}</p>
      <form action={action}>
        <label htmlFor={`${base}-confirm`}>{fr.account.confirmLabel}</label>
        <input id={`${base}-confirm`} name="confirm" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} required />
        {state.error && <p className="notice notice-warn" role="alert">{state.error}</p>}
        <button type="submit" className="btn btn-block btn-danger" disabled={pending}>
          {pending ? fr.account.deleting : fr.account.deleteButton}
        </button>
      </form>
    </details>
  );
}
