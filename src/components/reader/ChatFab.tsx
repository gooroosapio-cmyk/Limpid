"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useDialogHistory } from "@/components/shell/useDialogHistory";
import { useT } from "@/lib/i18n/client";
import { AskPanel } from "./AskPanel";

/**
 * Bouton de discussion flottant (V4, § 8) : 48 px, à droite, au-dessus du dock. Ouvre la
 * conversation dans une feuille (85 % de la hauteur sur mobile, panneau latéral sur
 * ordinateur). Le panneau reste monté après la première ouverture : fermer puis rouvrir
 * garde le fil et le brouillon.
 */
export function ChatFab({ reportId }: { reportId: string }) {
  const t = useT();
  const c = t.v4.chat;
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  useDialogHistory(dialog);

  return (
    <>
      <button
        ref={opener}
        type="button"
        className="chat-fab"
        aria-haspopup="dialog"
        aria-label={c.open}
        onClick={() => {
          setMounted(true);
          dialog.current?.showModal();
        }}
      >
        <Icon name="chat" size={22} />
      </button>
      <dialog ref={dialog} className="chat-sheet" aria-labelledby="chat-h" onClose={() => opener.current?.focus()}>
        <div className="chat-head">
          <h2 id="chat-h">{c.title}</h2>
          <button type="button" className="icon-button" aria-label={t.reader.close} onClick={() => dialog.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        {mounted && <AskPanel reportId={reportId} section={null} />}
      </dialog>
    </>
  );
}
