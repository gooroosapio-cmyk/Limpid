"use client";

import { useState } from "react";

/** Adresse du compte à saisir au paiement, avec copie en un geste. */
export function CopyEmail({ email, label, done }: { email: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="copy-email">
      <code>{email}</code>{" "}
      <button
        type="button"
        className="btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(email);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* Copie refusée par le navigateur : l'adresse reste affichée et sélectionnable. */
          }
        }}
      >
        {copied ? done : label}
      </button>
    </span>
  );
}
