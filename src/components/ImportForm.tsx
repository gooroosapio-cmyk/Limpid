"use client";

import { useId, useState } from "react";
import { fr } from "@/lib/i18n/fr";

type Tab = "file" | "link" | "text";
const MAX_PASTED = 50_000;

/**
 * Formulaire d'import (PDF p. 5). L'envoi au serveur sera branché avec le stockage
 * privé ; d'ici là, le bouton reste désactivé et l'interface le dit clairement.
 */
export function ImportForm() {
  const [tab, setTab] = useState<Tab>("file");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const base = useId();
  const tabs: { id: Tab; label: string }[] = [
    { id: "file", label: fr.create.tabs.file },
    { id: "link", label: fr.create.tabs.link },
    { id: "text", label: fr.create.tabs.text },
  ];

  function onKey(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]!;
    setTab(next.id);
    document.getElementById(`${base}-tab-${next.id}`)?.focus();
  }

  return (
    <form className="card" onSubmit={(e) => e.preventDefault()} aria-describedby={`${base}-notready`}>
      <div className="tabs" role="tablist" aria-label="Type de source">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            id={`${base}-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "file" && (
        <div role="tabpanel" id={`${base}-panel-file`} aria-labelledby={`${base}-tab-file`} className="dropzone">
          <h2>{fr.create.fileTitle}</h2>
          <p className="muted">
            {fr.create.fileFormats}
            <br />
            {fr.create.fileLimits}
          </p>
          <label className="btn" htmlFor={`${base}-file`}>
            {fr.create.chooseFile}
          </label>
          <input
            id={`${base}-file`}
            className="sr-only"
            type="file"
            accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          {fileName && <p className="muted" aria-live="polite">{fileName}</p>}
        </div>
      )}

      {tab === "link" && (
        <div role="tabpanel" id={`${base}-panel-link`} aria-labelledby={`${base}-tab-link`}>
          <label htmlFor={`${base}-url`}>{fr.create.linkLabel}</label>
          <input id={`${base}-url`} type="url" inputMode="url" placeholder="https://" aria-describedby={`${base}-url-hint`} />
          <p id={`${base}-url-hint`} className="muted">{fr.create.linkHint}</p>
        </div>
      )}

      {tab === "text" && (
        <div role="tabpanel" id={`${base}-panel-text`} aria-labelledby={`${base}-tab-text`}>
          <label htmlFor={`${base}-text`}>{fr.create.textLabel}</label>
          <textarea
            id={`${base}-text`}
            maxLength={MAX_PASTED}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-describedby={`${base}-text-hint`}
          />
          <p id={`${base}-text-hint`} className="muted">
            {fr.create.textHint} {text.length.toLocaleString("fr-FR")} / {MAX_PASTED.toLocaleString("fr-FR")}
          </p>
        </div>
      )}

      <p className="muted">{fr.create.next}</p>
      <p id={`${base}-notready`} className="notice notice-warn">{fr.create.notReady}</p>
      <button type="submit" className="btn btn-primary btn-block" aria-disabled="true" disabled>
        {fr.create.submit}
      </button>
    </form>
  );
}
