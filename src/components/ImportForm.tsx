"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LEVELS, type Level } from "@/lib/contracts/schemas";
import { LEVEL_LABELS } from "@/lib/labels";
import { fr } from "@/lib/i18n/fr";
import { SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/env";

type Tab = "file" | "link" | "text";
type Phase = { step: "idle" } | { step: "upload"; percent: number } | { step: "reading" };

const MAX_PASTED = 50_000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,.txt";

class FormError extends Error {}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("fr-FR")} Ko`;
  return `${(bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new FormError(typeof data.message === "string" ? data.message : "La création a échoué.");
  return data;
}

/** Envoi direct vers le stockage privé par URL signée, avec suivi de progression. */
function putFile(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("apikey", SUPABASE_PUBLISHABLE_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new FormError(fr.create.uploadFailed)));
    xhr.onerror = () => reject(new FormError(fr.create.uploadFailed));
    xhr.send(file);
  });
}

/** Formulaire d'import (PDF p. 5) : fichier, lien ou texte collé. */
export function ImportForm({ enabled, urlEnabled, defaultLevel }: { enabled: boolean; urlEnabled: boolean; defaultLevel: Level }) {
  const [tab, setTab] = useState<Tab>("file");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<Level>(defaultLevel);
  const [pages, setPages] = useState<5 | 7 | 12>(5);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  // Une clé par contenu soumis : un double envoi ne crée pas deux rapports.
  const keyRef = useRef<{ content: string; key: string } | null>(null);
  const router = useRouter();
  const base = useId();
  const pending = phase.step !== "idle";

  const content =
    tab === "text" ? text.trim() : tab === "link" ? url.trim() : file ? `${file.name}:${file.size}:${file.lastModified}` : "";
  const fileError =
    tab === "file" && file && file.size > MAX_FILE_BYTES ? fr.create.fileTooLarge : null;
  const canSubmit = enabled && !pending && !!content && !fileError && (tab !== "link" || urlEnabled);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    if (keyRef.current?.content !== `${tab}|${content}`) keyRef.current = { content: `${tab}|${content}`, key: crypto.randomUUID() };
    const params = { level, goal: "comprendre", target_pages: pages, idempotency_key: keyRef.current.key };
    try {
      let body: Record<string, unknown>;
      if (tab === "file" && file) {
        setPhase({ step: "upload", percent: 0 });
        const up = await postJson("/api/uploads", { file_name: file.name, byte_size: file.size });
        await putFile(String(up.signedUrl), file, (percent) => setPhase({ step: "upload", percent }));
        setPhase({ step: "reading" });
        body = { source: "upload", upload_id: up.uploadId, ...params };
      } else if (tab === "link") {
        setPhase({ step: "reading" });
        body = { source: "url", url: url.trim(), ...params };
      } else {
        setPhase({ step: "reading" });
        body = { source: "text", text, ...params };
      }
      const created = await postJson("/api/reports", body);
      router.push(`/rapports/${created.reportId}`);
    } catch (err) {
      setError(err instanceof FormError ? err.message : fr.create.networkError);
      setPhase({ step: "idle" });
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
    <form className="card" onSubmit={submit} aria-busy={pending}>
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
            disabled={pending}
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
            {file ? fr.create.changeFile : fr.create.chooseFile}
          </label>
          <input
            id={`${base}-file`}
            className="sr-only"
            type="file"
            accept={ACCEPT}
            disabled={pending}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <p className="file-name" aria-live="polite">
              {file.name} · {formatSize(file.size)}
            </p>
          )}
          {fileError && <p className="notice notice-warn" role="alert">{fileError}</p>}
        </div>
      )}

      {tab === "link" && (
        <div role="tabpanel" id={`${base}-panel-link`} aria-labelledby={`${base}-tab-link`}>
          <label htmlFor={`${base}-url`}>{fr.create.linkLabel}</label>
          <input
            id={`${base}-url`}
            type="url"
            inputMode="url"
            placeholder="https://"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={pending || !urlEnabled}
            aria-describedby={`${base}-url-hint`}
          />
          <p id={`${base}-url-hint`} className="muted">{urlEnabled ? fr.create.linkHint : fr.create.linkDisabled}</p>
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
            disabled={pending}
            aria-describedby={`${base}-text-hint`}
          />
          <p id={`${base}-text-hint`} className="muted">
            {fr.create.textHint} {text.length.toLocaleString("fr-FR")} / {MAX_PASTED.toLocaleString("fr-FR")}
          </p>
        </div>
      )}

      <label htmlFor={`${base}-level`}>{fr.create.levelLabel}</label>
      <select id={`${base}-level`} value={level} onChange={(e) => setLevel(e.target.value as Level)} disabled={pending}>
        {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
      </select>
      <label htmlFor={`${base}-pages`}>{fr.create.lengthLabel}</label>
      <select id={`${base}-pages`} value={pages} onChange={(e) => setPages(Number(e.target.value) as 5 | 7 | 12)} disabled={pending}>
        <option value={5}>{fr.create.lengths[5]}</option>
        <option value={7}>{fr.create.lengths[7]}</option>
        <option value={12}>{fr.create.lengths[12]}</option>
      </select>

      {error && <p className="notice notice-warn" role="alert">{error}</p>}
      {phase.step !== "idle" && (
        <div role="status" aria-live="polite" className="submit-status">
          {phase.step === "upload" ? (
            <>
              <label htmlFor={`${base}-progress`}>{fr.create.uploading(phase.percent)}</label>
              <progress id={`${base}-progress`} max={100} value={phase.percent} />
            </>
          ) : (
            <p>{tab === "text" ? fr.create.submitting : fr.create.reading}</p>
          )}
        </div>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={!canSubmit} aria-disabled={!canSubmit}>
        {pending ? fr.create.submitting : fr.create.submit}
      </button>
      <p className="muted small">{fr.create.privacy}</p>
    </form>
  );
}
