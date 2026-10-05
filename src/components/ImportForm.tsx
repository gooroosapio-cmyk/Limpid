"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ModeIcon } from "@/components/ModeIcon";
import { toast } from "@/components/shell/Toasts";
import { MODES, type Mode } from "@/lib/contracts/schemas";
import type { Dict } from "@/lib/i18n";
import { apiMessage } from "@/lib/i18n/api";
import { useLang, useT } from "@/lib/i18n/client";
import { SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/env";

type Tab = "file" | "link" | "text";
type Phase = { step: "idle" } | { step: "reading" } | { step: "creating" };
type Output = "common" | "each";

interface Prepared {
  sourceId: string;
  title: string | null;
  pageCount: number | null;
  byteSize: number | null;
  pendingOcr: boolean;
  duplicate: boolean;
}

/** Un document de la sélection, avec son propre état (envoi, lecture, prêt, échec). */
interface Item {
  key: string;
  file: File;
  status: "waiting" | "upload" | "reading" | "ready" | "error";
  percent: number;
  prepared?: Prepared;
  error?: string;
}

/** Envois et lectures simultanés au plus (le reste attend son tour). */
const CONCURRENCY = 2;

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

async function postJson(url: string, body: unknown, fallback: string, t: Dict): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new FormError(
      apiMessage(t, data, fallback),
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
 * Nouveau Limpid (V5) : Fichier(s), Lien ou Texte, puis une approche parmi quatre (cartes 2 × 2),
 * puis « Créer mon Limpid ». Chaque fichier est envoyé et lu aussitôt, avec son état ; plusieurs
 * documents donnent un Limpid commun (par défaut) ou un Limpid par document. Aucun document en
 * échec n'est ignoré sans décision explicite (le réessayer, le remplacer ou le retirer).
 */
export function ImportForm({
  enabled,
  urlEnabled,
  maxFileMb = 20,
  maxPages = 100,
  maxFiles = 5,
  initialTab = "file",
  defaultMode = "claire",
}: {
  enabled: boolean;
  urlEnabled: boolean;
  maxFileMb?: number;
  maxPages?: number;
  maxFiles?: number;
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
  const [items, setItems] = useState<Item[]>([]);
  const [output, setOutput] = useState<Output>("common");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replacing = useRef<string | null>(null);
  const running = useRef(new Set<string>());
  const key = useRef("");
  const router = useRouter();
  const base = useId();
  const busy = phase.step !== "idle";

  useEffect(() => {
    key.current = crypto.randomUUID();
  }, []);

  const patch = (k: string, p: Partial<Item>) => setItems((list) => list.map((it) => (it.key === k ? { ...it, ...p } : it)));

  async function prepare(body: Record<string, unknown>): Promise<Prepared> {
    const data = await postJson("/api/sources", body, t.add.failed, t);
    return {
      sourceId: String(data.sourceId),
      title: typeof data.title === "string" ? data.title : null,
      pageCount: typeof data.pageCount === "number" ? data.pageCount : null,
      byteSize: typeof data.byteSize === "number" ? data.byteSize : null,
      pendingOcr: data.pendingOcr === true,
      duplicate: data.duplicate === true,
    };
  }

  /** Document ajouté mais non expliqué : retiré (original effacé). */
  function forget(sourceId: string) {
    void fetch(`/api/sources/${sourceId}`, { method: "DELETE" }).catch(() => undefined);
  }

  /** Envoi direct au stockage puis lecture (OCR automatique pour les images et scans). */
  async function process(it: Item) {
    running.current.add(it.key);
    try {
      patch(it.key, { status: "upload", percent: 0, error: undefined });
      const up = await postJson("/api/uploads", { file_name: it.file.name, byte_size: it.file.size }, t.create.uploadFailed, t);
      await putFile(String(up.signedUrl), it.file, (percent) => patch(it.key, { percent }), t.create.uploadFailed);
      patch(it.key, { status: "reading" });
      const prepared = await prepare({ source: "upload", upload_id: String(up.uploadId) });
      patch(it.key, { status: "ready", prepared });
    } catch (err) {
      patch(it.key, { status: "error", error: err instanceof FormError ? err.message : t.create.networkError });
    } finally {
      running.current.delete(it.key);
    }
  }

  // File d'attente : deux documents à la fois, dans l'ordre de sélection.
  useEffect(() => {
    if (!enabled) return;
    const free = CONCURRENCY - running.current.size;
    for (const it of items.filter((x) => x.status === "waiting" && !running.current.has(x.key)).slice(0, Math.max(0, free))) {
      void process(it);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, enabled]);

  function add(files: FileList | File[] | null) {
    setError(null);
    if (!files) return;
    const list = [...files];
    const fresh: Item[] = [];
    for (const f of list) {
      // Même fichier choisi deux fois dans la sélection : ignoré.
      if (items.some((x) => x.file.name === f.name && x.file.size === f.size && x.file.lastModified === f.lastModified)) continue;
      if (f.size > maxFileMb * 1024 * 1024) {
        setError(t.create.fileTooLarge.replace("20", String(maxFileMb)));
        continue;
      }
      fresh.push({ key: crypto.randomUUID(), file: f, status: "waiting", percent: 0 });
    }
    const room = maxFiles - items.length;
    if (fresh.length > room) setError(t.add.maxFiles(maxFiles));
    setItems((cur) => [...cur, ...fresh.slice(0, Math.max(0, room))]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(k: string) {
    const it = items.find((x) => x.key === k);
    if (it?.prepared) forget(it.prepared.sourceId);
    setItems((cur) => cur.filter((x) => x.key !== k));
  }

  function retry(k: string) {
    patch(k, { status: "waiting", percent: 0, error: undefined, prepared: undefined });
  }

  function replace(k: string, f: File | null) {
    if (!f) return;
    const it = items.find((x) => x.key === k);
    if (it?.prepared) forget(it.prepared.sourceId);
    if (f.size > maxFileMb * 1024 * 1024) {
      patch(k, { status: "error", error: t.create.fileTooLarge.replace("20", String(maxFileMb)) });
      return;
    }
    patch(k, { file: f, status: "waiting", percent: 0, error: undefined, prepared: undefined });
  }

  const readyItems = items.filter((x) => x.status === "ready" && x.prepared);
  const pendingItems = items.filter((x) => x.status !== "ready" && x.status !== "error");
  const failedItems = items.filter((x) => x.status === "error");
  const many = tab === "file" && items.length > 1;
  const ready =
    enabled &&
    !busy &&
    (tab === "file"
      ? readyItems.length > 0 && pendingItems.length === 0 && failedItems.length === 0
      : tab === "link"
        ? /^https?:\/\/\S+\.\S+/.test(url.trim())
        : text.trim().length >= 20);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setError(null);
    try {
      if (tab === "file" && many && output === "each") {
        setPhase({ step: "creating" });
        const data = await postJson(
          "/api/reports/batch",
          { source_ids: readyItems.map((x) => x.prepared!.sourceId), mode, idempotency_key: key.current },
          t.add.failed,
          t,
        );
        const ids = Array.isArray(data.reportIds) ? data.reportIds : [];
        toast(t.add.sent(ids.length));
        router.push("/");
        return;
      }
      let sourceIds = readyItems.map((x) => x.prepared!.sourceId);
      if (tab !== "file") {
        setPhase({ step: "reading" });
        sourceIds = [(await prepare(tab === "link" ? { source: "url", url: url.trim() } : { source: "text", text })).sourceId];
      }
      setPhase({ step: "creating" });
      const data = await postJson("/api/reports", { source_ids: sourceIds, mode, idempotency_key: key.current }, t.add.failed, t);
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

  const statusOf = (it: Item) =>
    it.status === "upload"
      ? t.add.uploading(it.percent)
      : it.status === "reading"
        ? t.add.fileStatus.reading
        : it.status === "ready"
          ? it.prepared?.pendingOcr
            ? t.add.fileStatus.ocr
            : t.add.fileStatus.ready
          : it.status === "error"
            ? t.add.fileStatus.error
            : t.add.fileStatus.waiting;
  const kindOf = (name: string) => (name.split(".").pop() ?? "").toUpperCase().slice(0, 5);
  const count = many && output === "each" ? readyItems.length : 1;
  const status = phase.step === "reading" ? t.add.reading : phase.step === "creating" ? t.add.creating : "";

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
              multiple
              accept={ACCEPT}
              className="sr-only"
              disabled={busy || !enabled || items.length >= maxFiles}
              onChange={(e) => add(e.target.files)}
            />
            <input
              ref={replaceRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                if (replacing.current) replace(replacing.current, e.target.files?.[0] ?? null);
                replacing.current = null;
                e.target.value = "";
              }}
            />
            {items.length === 0 ? (
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
                  add(e.dataTransfer.files);
                }}
              >
                <span className="upload-icon" aria-hidden="true"><Icon name="plus" size={26} /></span>
                <span className="upload-title">{t.add.choose}</span>
                <span className="muted small">{t.add.formats} · {t.add.limits(maxFileMb, maxPages)}</span>
              </label>
            ) : (
              <>
                <ul className="filelist" aria-label={t.add.files}>
                  {items.map((it) => {
                    const name = it.prepared?.title ?? it.file.name;
                    return (
                      <li key={it.key} className={`fileline${it.status === "error" ? " is-error" : ""}`}>
                        <span className="fileline-icon" aria-hidden="true">
                          <Icon name={it.status === "error" ? "alert" : it.status === "ready" ? "file" : "hourglass"} />
                        </span>
                        <span className="fileline-text">
                          <b>{name}</b>
                          <small>
                            {[
                              kindOf(it.file.name),
                              formatSize(it.prepared?.byteSize ?? it.file.size, lang),
                              it.prepared?.pageCount ? t.add.pages(it.prepared.pageCount) : null,
                              statusOf(it),
                              it.prepared?.duplicate ? t.add.duplicate : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                          {it.status === "upload" && <progress value={it.percent} max={100} aria-hidden="true" />}
                          {it.error && <span className="fileline-error" role="alert">{it.error}</span>}
                        </span>
                        <span className="fileline-actions">
                          {it.status === "error" && (
                            <button type="button" className="ib" aria-label={t.add.retryFile(name)} onClick={() => retry(it.key)} disabled={busy}>
                              <Icon name="refresh" />
                            </button>
                          )}
                          <button
                            type="button"
                            className="ib"
                            aria-label={t.add.replaceFile(name)}
                            disabled={busy || it.status === "upload" || it.status === "reading"}
                            onClick={() => {
                              replacing.current = it.key;
                              replaceRef.current?.click();
                            }}
                          >
                            <Icon name="move" />
                          </button>
                          <button type="button" className="ib" aria-label={t.add.removeFile(name)} onClick={() => remove(it.key)} disabled={busy || it.status === "upload" || it.status === "reading"}>
                            <Icon name="close" />
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {items.length < maxFiles && (
                  <label htmlFor={`${base}-file`} className="btn btn-block add-more" aria-disabled={busy}>
                    <Icon name="plus" /> {t.add.addMore}
                  </label>
                )}
                {failedItems.length > 0 && <p className="notice notice-warn small" role="status">{t.add.blockedByError}</p>}
              </>
            )}
            <p className="muted small add-limits">{t.add.ocrAuto} {t.add.maxFiles(maxFiles)}</p>
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

      {many && (
        <fieldset className="choices output-choice" disabled={busy}>
          <legend>{t.add.outputLegend}</legend>
          {(["common", "each"] as const).map((o) => {
            const [title, desc] = o === "common" ? t.add.outputCommon : t.add.outputEach;
            return (
              <label key={o} className="choice">
                <input type="radio" name={`${base}-output`} checked={output === o} onChange={() => setOutput(o)} />
                <span>
                  <strong>{title}</strong>
                  <span className="option-desc">{desc}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      <fieldset className="modes" disabled={busy}>
        <legend>{t.add.modesLegend}</legend>
        <div className="mode-grid">
          {MODES.map((m) => (
            <label key={m} className={`mode-card${mode === m ? " is-selected" : ""}`}>
              <input type="radio" className="sr-only" name={`${base}-mode`} value={m} checked={mode === m} onChange={() => setMode(m)} aria-describedby={`${base}-mode-${m}`} />
              <ModeIcon mode={m} />
              <strong>{t.add.modes[m]?.title}</strong>
              <span id={`${base}-mode-${m}`} className="mode-desc">{t.add.modes[m]?.desc}</span>
              <span className="mode-check" aria-hidden="true"><Icon name="check" size={14} /></span>
            </label>
          ))}
        </div>
      </fieldset>

      <p role="status" aria-live="polite" className="sr-only">{status}</p>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <button
        type="submit"
        className={`btn btn-primary btn-block${phase.step !== "idle" ? " busy" : ""}`}
        disabled={!ready}
      >
        {phase.step === "creating" ? t.add.creating : count > 1 ? t.add.createMany(count) : t.add.create} {phase.step !== "creating" && <Icon name="arrow" />}
      </button>
    </form>
  );
}
