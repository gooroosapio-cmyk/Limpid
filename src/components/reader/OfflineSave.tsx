"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";
import { isSaved, offlineSupported, removeSaved, saveReport } from "@/lib/offline";

/** Ligne « Enregistrer hors connexion » des options du rapport. */
export function OfflineSave({ account, path, title }: { account: string; path: string; title: string }) {
  const t = useT();
  const [state, setState] = useState<"unknown" | "unsupported" | "idle" | "saving" | "saved" | "failed">("unknown");

  useEffect(() => {
    if (!offlineSupported()) {
      setState("unsupported");
      return;
    }
    isSaved(account, path).then((s) => setState(s ? "saved" : "idle")).catch(() => setState("idle"));
  }, [account, path]);

  if (state === "unknown" || state === "unsupported") return null;
  const saved = state === "saved";
  return (
    <li>
      <button
        type="button"
        className="row"
        aria-pressed={saved}
        disabled={state === "saving"}
        onClick={async () => {
          if (saved) {
            await removeSaved(account, path).catch(() => undefined);
            setState("idle");
            return;
          }
          setState("saving");
          try {
            await saveReport(account, path, title);
            setState("saved");
          } catch {
            setState("failed");
          }
        }}
      >
        <span className="row-icon"><Icon name={saved ? "check" : "cloud"} /></span>
        <span className="row-text">
          <b>{saved ? t.pwa.savedRow : state === "saving" ? t.pwa.saving : t.pwa.save}</b>
          <small role="status">{state === "failed" ? t.pwa.saveFailed : saved ? t.pwa.savedSub : t.pwa.saveSub}</small>
        </span>
        <Icon name="chevron" className="row-chevron" />
      </button>
    </li>
  );
}
