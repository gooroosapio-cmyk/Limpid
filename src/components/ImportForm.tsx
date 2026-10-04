"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LEVELS, type Level } from "@/lib/contracts/schemas";
import { LEVEL_LABELS } from "@/lib/labels";
import { fr } from "@/lib/i18n/fr";

type Tab = "file" | "link" | "text";
const MAX_PASTED = 50_000;

/**
 * Formulaire d'import (PDF p. 5). Phase 2b : le texte collé est branché ; fichiers et
 * liens restent désactivés et l'interface le dit clairement.
 */
export function ImportForm({ enabled, defaultLevel }: { enabled: boolean; defaultLevel: Level }) {
  const [tab, setTab] = useState<Tab>("text");
  const [text, setText] = useState("");
  const [level, setLevel] = useState<Level>(defaultLevel);
  const [pages, setPages] = useState<5 | 7 | 12>(5);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Une clé par contenu soumis : un double clic ne crée pas deux rapports.
  const keyRef = useRef<{ text: string; key: string } | null>(null);
  const router = useRouter();
  const base = useId();
  const canSubmit = enabled && tab === "text" && text.trim().length > 0 && !pending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    if (keyRef.current?.text !== text) keyRef.current = { text, key: crypto.randomUUID() };
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, level, goal: "comprendre", target_pages: pages, idempotency_key: keyRef.current.key }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "La création a échoué.");
      router.push(`/rapports/${body.reportId}`);
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }
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
    <form className="card" onSubmit={submit} aria-describedby={`${base}-notready`}>
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

      {tab !== "text" && <p id={`${base}-notready`} className="notice notice-warn">{fr.create.notReady}</p>}

      <label htmlFor={`${base}-level`}>{fr.create.levelLabel}</label>
      <select id={`${base}-level`} value={level} onChange={(e) => setLevel(e.target.value as Level)}>
        {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
      </select>
      <label htmlFor={`${base}-pages`}>{fr.create.lengthLabel}</label>
      <select id={`${base}-pages`} value={pages} onChange={(e) => setPages(Number(e.target.value) as 5 | 7 | 12)}>
        <option value={5}>{fr.create.lengths[5]}</option>
        <option value={7}>{fr.create.lengths[7]}</option>
        <option value={12}>{fr.create.lengths[12]}</option>
      </select>

      {error && <p className="notice notice-warn" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={!canSubmit} aria-disabled={!canSubmit}>
        {pending ? fr.create.submitting : fr.create.submit}
      </button>
    </form>
  );
}
