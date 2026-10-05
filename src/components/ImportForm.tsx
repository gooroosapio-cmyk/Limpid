"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { MODES, type Mode } from "@/lib/contracts/schemas";
import { useLang, useT } from "@/lib/i18n/client";
import { SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/env";

type Tab = "file" | "link" | "text";
type Phase =
  | { step: "idle" }
  | { step: "upload"; percent: number }
  | { step: "reading" }
  // Image ou PDF scanné : l'envoi est fait, l'accord pour la lecture par l'IA est demandé.
  | { step: "consent"; uploadId: string; message: string }
  | { step: "creating" };

interface Prepared {
  sourceId: string;
  title: string | null;
  pageCount: number | null;
  byteSize: number | null;
}

const MAX_PASTED = 50_000;
const ACCEPT = ".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp";

class FormError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly reportId?: string,
  ) {
    super(message);
  }
}

function formatSize(bytes: number, lang: string): string {
  const locale = lang === "en" ? "en-GB" : "fr-FR";
  const [kb, mb] = lang === "en" ? ["KB", "MB"] : ["Ko", "Mo"];
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(locale)} ${kb}`;
  return `${(bytes / 1024 / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} ${mb}`;
}

async function postJson(url: string, body: unknown, fallback: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new FormError(
      typeof data.message === "string" ? data.message : fallback,
      typeof data.error === "string" ? data.error : undefined,
      typeof data.reportId === "string" ? data.reportId : undefined,
    );
  }
  return data;
}

/** Envoi direct vers le stockage privé par URL signée, avec suivi de progression. */
function putFile(url: string, file: File, onProgress: (percent: number) => void, failed: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("apikey", SUPABASE_PUBLISHABLE_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new FormError(failed)));
    xhr.onerror = () => reject(new FormError(failed));
    xhr.send(file);
  });
}

/**
 * Nouveau Limpid (V4) : Fichier, Lien ou Texte, puis une approche parmi quatre, puis
 * « Créer mon Limpid ». Un fichier choisi est envoyé et lu aussitôt (pages détectées) ;
 * la génération ne part qu'à la création.
 */
export function ImportForm({
  enabled,
  urlEnabled,
  maxFileMb = 20,
  maxPages = 100,
  initialTab = "file",
  defaultMode = "claire",
}: {
  enabled: boolean;
  urlEnabled: boolean;
  maxFileMb?: number;
  maxPages?: number;
  /** Onglet ouvert à l'arrivée (menu : texte, PDF, lien). */
  initialTab?: Tab;
  /** Dernier choix explicite, sinon Explication claire. */
  defaultMode?: Mode;
}) {
  const t = useT();
  const lang = useLang();
  const tabs: Tab[] = urlEnabled ? ["file", "link", "text"] : ["file", "text"];
  const [tab, setTab] = useState<Tab>(tabs.includes(initialTab) ? initialTab : "file");
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [file, setFile] = useState<File | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const key = useRef("");
  const router = useRouter();
  const base = useId();
  const busy = phase.step === "upload" || phase.step === "reading" || phase.step === "creating";

  useEffect(() => {
    key.current = crypto.randomUUID();
  }, []);

  async function prepare(body: Record<string, unknown>): Promise<Prepared> {
    const data = await postJson("/api/sources", body, t.add.failed);
    return {
      sourceId: String(data.sourceId),
      title: typeof data.title === "string" ? data.title : null,
      pageCount: typeof data.pageCount === "number" ? data.pageCount : null,
      byteSize: typeof data.byteSize === "number" ? data.byteSize : null,
    };
  }

  /** Lecture d'un fichier envoyé ; demande l'accord si l'IA doit lire des images. */
  async function readUpload(uploadId: string, allowOcr: boolean) {
    setPhase({ step: "reading" });
    try {
      setPrepared(await prepare({ source: "upload", upload_id: uploadId, allow_ocr: allowOcr }));
      setPhase({ step: "idle" });
    } catch (err) {
      if (err instanceof FormError && err.code === "ocr_consent") {
        setPhase({ step: "consent", uploadId, message: err.message });
        return;
      }
      throw err;
    }
  }

  /** Document ajouté mais non expliqué : retiré (original effacé). */
  function forget(sourceId: string) {
    void fetch(`/api/sources/${sourceId}`, { method: "DELETE" }).catch(() => undefined);
  }

  async function choose(f: File | null) {
    setError(null);
    if (prepared) forget(prepared.sourceId);
    setPrepared(null);
    setFile(f);
    if (!f) return setPhase({ step: "idle" });
    if (f.size > maxFileMb * 1024 * 1024) {
      setError(t.create.fileTooLarge.replace("20", String(maxFileMb)));
      setFile(null);
      return;
    }
    if (!enabled) return;
    try {
      setPhase({ step: "upload", percent: 0 });
      const up = await postJson("/api/uploads", { file_name: f.name, byte_size: f.size }, t.create.uploadFailed);
      await putFile(String(up.signedUrl), f, (percent) => setPhase({ step: "upload", percent }), t.create.uploadFailed);
      await readUpload(String(up.uploadId), false);
    } catch (err) {
      setError(err instanceof FormError ? err.message : t.create.networkError);
      setPhase({ step: "idle" });
      setFile(null);
    }
  }

  function remove() {
    if (prepared) forget(prepared.sourceId);
    setPrepared(null);
    setFile(null);
    setPhase({ step: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }

  const ready =
    enabled &&
    !busy &&
    phase.step !== "consent" &&
    (tab === "file" ? !!prepared : tab === "link" ? /^https?:\/\/\S+\.\S+/.test(url.trim()) : text.trim().length >= 20);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setError(null);
    try {
      let sourceId = prepared?.sourceId;
      if (tab !== "file") {
        setPhase({ step: "reading" });
        sourceId = (await prepare(tab === "link" ? { source: "url", url: url.trim() } : { source: "text", text })).sourceId;
      }
      setPhase({ step: "creating" });
      const data = await postJson("/api/reports", { source_id: sourceId, mode, idempotency_key: key.current }, t.add.failed);
      router.push(`/rapports/${String(data.reportId)}`);
    } catch (err) {
      if (err instanceof FormError && err.reportId) {
        router.push(`/rapports/${err.reportId}`);
        return;
      }
      setError(err instanceof FormError ? err.message : t.create.networkError);
      setPhase({ step: "idle" });
      key.current = crypto.randomUUID();
    }
  }

  function onTabKey(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]!;
    setTab(next);
    document.getElementById(`${base}-tab-${next}`)?.focus();
  }

  const status =
    phase.step === "upload" ? t.add.uploading(phase.percent) : phase.step === "reading" ? t.add.reading : phase.step === "creating" ? t.add.creating : "";

  return (
    <form onSubmit={submit} aria-busy={busy} className="import">
      <div className="seg import-tabs" role="tablist" aria-label={t.add.tabsLabel}>
        {tabs.map((id, i) => (
          <button
            key={id}
            id={`${base}-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`${base}-panel`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(e) => onTabKey(e, i)}
            disabled={busy}
          >
            <Icon name={id === "file" ? "file" : id === "link" ? "link" : "list"} size={18} /> {t.add.tabs[id]}
          </button>
        ))}
      </div>

      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${tab}`} className="import-panel">
        {tab === "file" && (
          <>
            <input
              ref={inputRef}
              id={`${base}-file`}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              disabled={busy || !enabled}
              onChange={(e) => void choose(e.target.files?.[0] ?? null)}
            />
            {!file ? (
              <label
                htmlFor={`${base}-file`}
                className={dragging ? "upload dragging" : "upload"}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void choose(e.dataTransfer.files?.[0] ?? null);
                }}
              >
                <span className="upload-icon" aria-hidden="true"><Icon name="plus" size={26} /></span>
                <span className="upload-title">{t.add.choose}</span>
                <span className="muted small">{t.add.drop}</span>
                <span className="muted small">{t.add.formats} · {t.add.limits(maxFileMb, maxPages)}</span>
              </label>
            ) : (
              <div className="fileline">
                <span className="fileline-icon" aria-hidden="true"><Icon name="file" /></span>
                <span className="fileline-text">
                  <b>{prepared?.title ?? file.name}</b>
                  <small>
                    {[formatSize(prepared?.byteSize ?? file.size, lang), prepared?.pageCount ? t.add.pages(prepared.pageCount) : null, status || null]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                  {phase.step === "upload" && <progress value={phase.percent} max={100} aria-hidden="true" />}
                </span>
                <label htmlFor={`${base}-file`} className="btn-link fileline-replace" aria-disabled={busy}>
                  {t.add.replace}
                </label>
                <button type="button" className="ib" aria-label={t.add.remove} onClick={remove} disabled={busy}>
                  <Icon name="close" />
                </button>
              </div>
            )}
            {phase.step === "consent" && (
              <div className="notice" role="alert">
                <strong>{t.add.ocrTitle}</strong>
                <p>{phase.message}</p>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void readUpload(phase.uploadId, true).catch((err) => {
                      setError(err instanceof FormError ? err.message : t.create.networkError);
                      setPhase({ step: "idle" });
                    })
                  }
                >
                  {t.add.ocrAllow}
                </button>
              </div>
            )}
          </>
        )}
        {tab === "link" && (
          <>
            <label htmlFor={`${base}-url`}>{t.add.linkLabel}</label>
            <input id={`${base}-url`} type="url" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} autoComplete="off" />
          </>
        )}
        {tab === "text" && (
          <>
            <label htmlFor={`${base}-text`}>{t.add.textLabel}</label>
            <textarea
              id={`${base}-text`}
              value={text}
              maxLength={MAX_PASTED}
              placeholder={t.add.textPlaceholder}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              aria-describedby={`${base}-count`}
            />
            <p id={`${base}-count`} className="muted small text-count">{t.add.textCount(text.length, MAX_PASTED)}</p>
          </>
        )}
      </div>

      <fieldset className="modes" disabled={busy}>
        <legend>{t.add.modesLegend}</legend>
        {MODES.map((m) => (
          <label key={m} className="option mode-option">
            <input type="radio" name={`${base}-mode`} value={m} checked={mode === m} onChange={() => setMode(m)} />
            <span>
              <strong>{t.add.modes[m]?.title}</strong>
              <span className="option-desc">{t.add.modes[m]?.desc}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <p role="status" aria-live="polite" className="sr-only">{status}</p>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <button
        type="submit"
        className={`btn btn-primary btn-block${phase.step === "creating" || phase.step === "reading" ? " busy" : ""}`}
        disabled={!ready}
      >
        {phase.step === "creating" ? t.add.creating : t.add.create} {phase.step !== "creating" && <Icon name="arrow" />}
      </button>
    </form>
  );
}
