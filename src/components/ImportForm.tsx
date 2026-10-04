"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { fr } from "@/lib/i18n/fr";
import { SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/env";

type Tab = "file" | "link" | "text";
type Phase =
  | { step: "idle" }
  | { step: "upload"; percent: number }
  | { step: "reading" }
  // PDF scanné : l'envoi est fait, l'accord pour la lecture par Gemini est demandé.
  | { step: "consent"; uploadId: string; message: string };

const MAX_PASTED = 50_000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp";
const IMAGE = /\.(jpe?g|png|webp)$/i;

class FormError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("fr-FR")} Ko`;
  return `${(bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new FormError(typeof data.message === "string" ? data.message : "La création a échoué.", data.error);
  }
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
export function ImportForm({ enabled, urlEnabled }: { enabled: boolean; urlEnabled: boolean }) {
  const [tab, setTab] = useState<Tab>("file");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  const [imageConsent, setImageConsent] = useState(false);
  const router = useRouter();
  const base = useId();
  const pending = phase.step !== "idle" && phase.step !== "consent";
  const isImage = tab === "file" && !!file && IMAGE.test(file.name);

  const content =
    tab === "text" ? text.trim() : tab === "link" ? url.trim() : file ? `${file.name}:${file.size}:${file.lastModified}` : "";
  const fileError =
    tab === "file" && file && file.size > MAX_FILE_BYTES ? fr.create.fileTooLarge : null;
  const canSubmit =
    enabled && !pending && phase.step !== "consent" && !!content && !fileError && (tab !== "link" || urlEnabled) && (!isImage || imageConsent);

  async function create(body: Record<string, unknown>) {
    try {
      // Préparation sans IA : le lecteur vérifie ensuite ce qui a été lu.
      const prepared = await postJson("/api/sources", body);
      router.push(`/sources/${prepared.sourceId}`);
    } catch (err) {
      if (err instanceof FormError && err.code === "ocr_consent" && typeof body.upload_id === "string") {
        setPhase({ step: "consent", uploadId: body.upload_id, message: err.message });
        return;
      }
      throw err;
    }
  }

  /** Accord donné pour un PDF scanné : même envoi, même clé, lecture OCR autorisée. */
  async function confirmOcr() {
    if (phase.step !== "consent") return;
    const uploadId = phase.uploadId;
    setError(null);
    setPhase({ step: "reading" });
    try {
      await create({ source: "upload", upload_id: uploadId, allow_ocr: true });
    } catch (err) {
      setError(err instanceof FormError ? err.message : fr.create.networkError);
      setPhase({ step: "idle" });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      let body: Record<string, unknown>;
      if (tab === "file" && file) {
        setPhase({ step: "upload", percent: 0 });
        const up = await postJson("/api/uploads", { file_name: file.name, byte_size: file.size });
        await putFile(String(up.signedUrl), file, (percent) => setPhase({ step: "upload", percent }));
        setPhase({ step: "reading" });
        body = { source: "upload", upload_id: up.uploadId, allow_ocr: isImage && imageConsent };
      } else if (tab === "link") {
        setPhase({ step: "reading" });
        body = { source: "url", url: url.trim() };
      } else {
        setPhase({ step: "reading" });
        body = { source: "text", text };
      }
      await create(body);
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
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setImageConsent(false);
              if (phase.step === "consent") setPhase({ step: "idle" });
            }}
          />
          {file && (
            <p className="file-name" aria-live="polite">
              {file.name} · {formatSize(file.size)}
            </p>
          )}
          {fileError && <p className="notice notice-warn" role="alert">{fileError}</p>}
          {isImage && (
            <label className="consent">
              <input type="checkbox" checked={imageConsent} onChange={(e) => setImageConsent(e.target.checked)} disabled={pending} />
              <span>{fr.create.imageConsent}</span>
            </label>
          )}
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

      {error && <p className="notice notice-warn" role="alert">{error}</p>}
      {phase.step === "consent" && (
        <div className="notice notice-warn" role="alertdialog" aria-labelledby={`${base}-consent`}>
          <p id={`${base}-consent`}>{phase.message}</p>
          <p className="muted">{fr.create.ocrInfo}</p>
          <div className="consent-actions">
            <button type="button" className="btn btn-primary" onClick={confirmOcr}>{fr.create.ocrAccept}</button>
            <button type="button" className="btn" onClick={() => setPhase({ step: "idle" })}>{fr.create.ocrDecline}</button>
          </div>
        </div>
      )}
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
        {pending ? fr.create.reading : `${fr.create.next} →`}
      </button>
      <p className="muted small">{fr.create.privacy}</p>
    </form>
  );
}
