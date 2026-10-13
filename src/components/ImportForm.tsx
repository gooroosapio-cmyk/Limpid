"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { Illustration } from "@/components/Illustration";
import { toast } from "@/components/shell/Toasts";
import { V6_MODES, type Mode } from "@/lib/contracts/schemas";
import type { Dict } from "@/lib/i18n";
import { apiMessage } from "@/lib/i18n/api";
import { useLang, useT } from "@/lib/i18n/client";
import { ACTION_PRICES } from "@/lib/billing/catalog";
import { DEFAULT_SUPPORTS, readSupports, SUPPORTS, type Support } from "@/lib/supports/supports";
import { SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/env";
import { InsufficientCreditsState } from "@/components/jobs/InsufficientCreditsState";

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
  /** Refusé avant l'envoi (taille, format, fichier vide) : à remplacer ou retirer. */
  rejected?: boolean;
}

type V6Mode = (typeof V6_MODES)[number];

/** Envois et lectures simultanés au plus (le reste attend son tour). */
const CONCURRENCY = 2;

const SUPPORT_ICONS: Record<Support, IconName> = { livre: "book", parcours: "path", carte: "mindmap", flashcards: "cards" };
/** Sélection en cours gardée pendant la session (retour arrière, erreur, reprise). */
const SUPPORTS_KEY = "limpid-supports-draft";
function readDraftSupports(): Support[] | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(SUPPORTS_KEY) ?? "null");
    return Array.isArray(v) && v.length ? readSupports(v) : null;
  } catch {
    return null;
  }
}

const ACCEPT = ".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp";
/** Formats acceptés, pour le message de non-conformité (TYPE). */
const FORMATS = "PDF, DOCX, TXT, JPG, PNG, WEBP";

interface Billing { code: string; topup: string | null; needed?: number; available?: number }

/** Création bloquée par le solde : sources et approche gardées sur l'appareil pour reprendre après recharge. */
const PENDING_KEY = "limpid-pending-import";
interface PendingImport { sourceIds: string[]; mode: string; supports?: Support[]; at: number }
/** Une source jamais utilisée est purgée après 24 h : au-delà, la reprise n'est plus proposée. */
const PENDING_MAX_MS = 20 * 3600_000;

function readPending(): PendingImport | null {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null") as PendingImport | null;
    if (!p || !Array.isArray(p.sourceIds) || !p.sourceIds.length || Date.now() - p.at > PENDING_MAX_MS) return null;
    return p;
  } catch {
    return null;
  }
}
function writePending(p: Omit<PendingImport, "at"> | null) {
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify({ ...p, at: Date.now() }));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* stockage indisponible : la reprise ne sera simplement pas proposée */
  }
}

class FormError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly reportId?: string,
    /** Blocage de l'offre : liens vers les offres et, si elle aide, la recharge. */
    public readonly billing?: Billing,
    /** Détail de l'erreur (code d'extraction, nombre de pages) quand le serveur le donne. */
    public readonly detail?: { reason?: string; pages?: number },
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
      (data.billing as Billing | undefined) ?? undefined,
      { reason: typeof data.reason === "string" ? data.reason : undefined, pages: typeof data.pages === "number" ? data.pages : undefined },
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
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new FormError(failed, "network")));
    xhr.onerror = () => reject(new FormError(failed, "network"));
    xhr.onabort = () => reject(new FormError(failed, "network"));
    xhr.send(file);
  });
}

/**
 * Message de non-conformité d'un fichier (kit V6, § 12) : codes du contrôle local et du serveur
 * ramenés aux messages du kit ; sinon le message précis du serveur.
 */
function fileError(t: Dict, err: unknown, file: File, maxFileMb: number, maxPages: number, lang: string): string {
  const e = t.add.fileErrors;
  if (!(err instanceof FormError)) return e.network;
  const code = err.detail?.reason ?? err.code;
  switch (code) {
    case "too_large":
    case "size":
      return e.size(maxFileMb, (file.size / 1024 / 1024).toLocaleString(lang === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 1 }));
    case "pages":
    case "too_many_pages":
      return err.detail?.pages ? e.pages(err.detail.pages, maxPages) : err.message;
    case "type":
    case "unsupported":
    case "type_mismatch":
      return e.type(FORMATS);
    case "empty":
      return e.empty;
    case "encrypted":
      return e.encrypted;
    case "corrupt":
      return e.corrupt;
    case "network":
      return e.network;
    default:
      return err.message;
  }
}

/** Contrôle local immédiat (le serveur impose les limites réelles et vérifie la signature). */
function precheck(t: Dict, f: File, maxFileMb: number, lang: string): string | null {
  const ext = `.${(f.name.split(".").pop() ?? "").toLowerCase()}`;
  if (!f.name.includes(".") || !ACCEPT.split(",").includes(ext)) return t.add.fileErrors.type(FORMATS);
  if (f.size === 0) return t.add.fileErrors.empty;
  if (f.size > maxFileMb * 1024 * 1024) return fileError(t, new FormError("", "too_large"), f, maxFileMb, 0, lang);
  return null;
}

/**
 * Nouveau Limpid (V6) : Fichier(s), Lien ou Texte, puis une approche parmi quatre (cartes 2 × 2),
 * puis « Créer mon Limpid ». Chaque fichier est envoyé et lu aussitôt, avec son état ; plusieurs
 * documents donnent un Limpid commun (par défaut) ou un Limpid par document. Aucun document en
 * échec n'est ignoré sans décision explicite (le réessayer, le remplacer ou le retirer).
 */
export function ImportForm({
  enabled,
  maxFileMb = 20,
  maxPages = 100,
  maxFiles = 5,
  defaultMode = "auto",
  hero = false,
  folderId = null,
}: {
  /** Dossier sélectionné dans la bibliothèque : le nouveau Limpid y est rangé. */
  folderId?: string | null;
  enabled: boolean;
  /** Accueil (kit V4) : la zone de dépôt est la grande carte jaune « Créer un Limpid ». */
  hero?: boolean;
  maxFileMb?: number;
  maxPages?: number;
  maxFiles?: number;
  /** Dernier choix explicite (approche V6), sinon Par défaut. */
  defaultMode?: Mode;
}) {
  const t = useT();
  const lang = useLang();
  // V6 : un seul réglage, « Votre approche » (aucun niveau) ; un ancien choix V4 revient à Par défaut.
  const [mode] = useState<V6Mode>((V6_MODES as readonly string[]).includes(defaultMode) ? (defaultMode as V6Mode) : "auto");
  // Supports d'apprentissage : le livre interactif est proposé à chaque nouvelle création.
  const [supports, setSupportsState] = useState<Support[]>(DEFAULT_SUPPORTS);
  const [needOne, setNeedOne] = useState(false);
  const setSupports = (next: Support[]) => {
    setSupportsState(next);
    try {
      sessionStorage.setItem(SUPPORTS_KEY, JSON.stringify(next));
    } catch {}
  };
  const toggleSupport = (s: Support) => {
    const next = supports.includes(s) ? supports.filter((x) => x !== s) : SUPPORTS.filter((x) => x === s || supports.includes(x));
    if (!next.length) {
      setNeedOne(true);
      return;
    }
    setNeedOne(false);
    setSupports(next);
  };
  const [items, setItems] = useState<Item[]>([]);
  const [output, setOutput] = useState<Output>("common");
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  const [error, setError] = useState<string | null>(null);
  /** Message sous la console (sélection trop nombreuse) ; les fichiers déjà là restent. */
  const [consoleNote, setConsoleNote] = useState<string | null>(null);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [resuming, setResuming] = useState(false);
  // Devis reçu pour un jeu de documents donné (clé) : affiché seulement s'il correspond encore.
  const [quoted, setQuoted] = useState<{ key: string; credits: number; extras: number } | null>(null);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique du stockage de l'appareil
    setPending(readPending());
    const draft = readDraftSupports();
    if (draft) setSupportsState(draft);
  }, []);

  /** « Reprendre mon Limpid » après recharge : mêmes documents, même approche, sans réimport. */
  async function resumePending() {
    if (!pending || resuming) return;
    setResuming(true);
    setError(null);
    try {
      const data = await postJson("/api/reports", { source_ids: pending.sourceIds, ...(pending.supports ? { supports: pending.supports } : { mode: pending.mode }), idempotency_key: key.current }, t.add.failed, t);
      writePending(null);
      router.push(`/rapports/${String(data.reportId)}`);
    } catch (err) {
      if (err instanceof FormError && err.reportId) {
        writePending(null);
        router.push(`/rapports/${err.reportId}`);
        return;
      }
      // Document expiré ou supprimé : la reprise n'est plus possible, on le dit.
      if (err instanceof FormError && (err.code === "source_missing" || err.code === "upload_missing")) {
        writePending(null);
        setPending(null);
      }
      setError(err instanceof FormError ? err.message : t.create.networkError);
      setBilling(err instanceof FormError ? (err.billing ?? null) : null);
      key.current = crypto.randomUUID();
      setResuming(false);
    }
  }

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
      patch(it.key, { status: "error", error: fileError(t, err, it.file, maxFileMb, maxPages, lang) });
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
    setConsoleNote(null);
    if (!files) return;
    const list = [...files];
    const fresh: Item[] = [];
    for (const f of list) {
      // Même fichier choisi deux fois dans la sélection : ignoré.
      if (items.some((x) => x.file.name === f.name && x.file.size === f.size && x.file.lastModified === f.lastModified)) continue;
      // Non conforme : gardé dans la liste avec son message, sans toucher aux autres fichiers.
      const refused = precheck(t, f, maxFileMb, lang);
      fresh.push(refused ? { key: crypto.randomUUID(), file: f, status: "error", percent: 0, error: refused, rejected: true } : { key: crypto.randomUUID(), file: f, status: "waiting", percent: 0 });
    }
    const room = maxFiles - items.length;
    if (fresh.length > room) setConsoleNote(t.add.maxFiles(maxFiles));
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
    const refused = precheck(t, f, maxFileMb, lang);
    if (refused) {
      patch(k, { file: f, status: "error", error: refused, rejected: true, prepared: undefined });
      return;
    }
    patch(k, { file: f, status: "waiting", percent: 0, error: undefined, prepared: undefined, rejected: false });
  }

  const readyItems = items.filter((x) => x.status === "ready" && x.prepared);
  // Devis fixe dès que les documents sont lus (Limpid commun) : affiché sur le bouton.
  const sourceKey = !(readyItems.length > 1 && output === "each") ? readyItems.map((x) => x.prepared!.sourceId).join(",") : "";
  // Devis propre à la sélection (documents + supports) : une réponse devenue obsolète est ignorée.
  const quoteKey = sourceKey ? `${sourceKey}|${supports.join(",")}` : "";
  const quote = quoted && quoted.key === quoteKey ? quoted.credits : null;
  // Pendant la mise à jour, la valeur précédente reste affichée (état discret), le lancement attend.
  const staleQuote = quoted && quote === null && quoteKey ? quoted : null;
  useEffect(() => {
    if (!quoteKey) return;
    let live = true;
    const [ids, list] = quoteKey.split("|");
    fetch("/api/billing/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_ids: ids!.split(","), supports: list!.split(",") }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { credits?: number; extras?: { credits: number }[] } | null) =>
        live && setQuoted(typeof d?.credits === "number" ? { key: quoteKey, credits: d.credits, extras: (d.extras ?? []).reduce((n, e) => n + e.credits, 0) } : null),
      )
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [quoteKey]);
  const pendingItems = items.filter((x) => x.status !== "ready" && x.status !== "error");
  const failedItems = items.filter((x) => x.status === "error");
  const many = items.length > 1;
  const pages = readyItems.reduce((n, x) => n + (x.prepared?.pageCount ?? 0), 0);
  const ready =
    enabled &&
    !busy &&
    readyItems.length > 0 &&
    pendingItems.length === 0 &&
    failedItems.length === 0 &&
    supports.length > 0 &&
    // Un Limpid commun ne part qu'avec un devis correspondant à la sélection affichée.
    (!quoteKey || quote !== null);

  /** Condition manquante, dite à côté du bouton désactivé. */
  const missing = !enabled || busy
    ? null
    : failedItems.length > 0
      ? t.add.v2.needFix
      : pendingItems.length > 0
        ? t.add.v2.needWait
        : readyItems.length === 0
          ? t.add.v2.needFile
          : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setError(null);
    try {
      if (many && output === "each") {
        setPhase({ step: "creating" });
        const data = await postJson(
          "/api/reports/batch",
          { source_ids: readyItems.map((x) => x.prepared!.sourceId), supports, idempotency_key: key.current, folder_id: folderId },
          t.add.failed,
          t,
        );
        const ids = Array.isArray(data.reportIds) ? data.reportIds : [];
        toast(t.add.sent(ids.length));
        router.push("/bibliotheque");
        return;
      }
      const sourceIds = readyItems.map((x) => x.prepared!.sourceId);
      setPhase({ step: "creating" });
      const data = await postJson("/api/reports", { source_ids: sourceIds, supports, idempotency_key: key.current, folder_id: folderId }, t.add.failed, t);
      writePending(null);
      router.push(`/rapports/${String(data.reportId)}`);
    } catch (err) {
      if (err instanceof FormError && err.reportId) {
        router.push(`/rapports/${err.reportId}`);
        return;
      }
      setError(err instanceof FormError ? err.message : t.create.networkError);
      setBilling(err instanceof FormError ? (err.billing ?? null) : null);
      if (err instanceof FormError && err.billing?.code === "credits" && !(many && output === "each")) {
        writePending({ sourceIds: readyItems.map((x) => x.prepared!.sourceId), mode, supports });
      }
      setPhase({ step: "idle" });
      key.current = crypto.randomUUID();
    }
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
      {pending && !items.length && (
        <section className="fl-card fl-pending" aria-labelledby={`${base}-pending`}>
          <h2 id={`${base}-pending`}>{t.fluid.credits.resumeTitle}</h2>
          <p className="muted">{t.fluid.credits.resumeLede}</p>
          <div className="fl-actions fl-actions-row">
            <button type="button" className={`btn btn-primary${resuming ? " busy" : ""}`} disabled={resuming} aria-busy={resuming} onClick={resumePending}>
              {t.fluid.credits.resumeCta}
            </button>
            <button type="button" className="btn-link" onClick={() => { writePending(null); setPending(null); }}>
              {t.fluid.credits.resumeDismiss}
            </button>
          </div>
        </section>
      )}
      <div className="import-panel">
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
            {items.length < maxFiles && (
              <label
                htmlFor={`${base}-file`}
                className={`upload${hero && !items.length ? " upload-hero" : ""}${dragging ? " dragging" : ""}`}
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
                {hero && !items.length ? (
                  <>
                    <span className="hero-plus" aria-hidden="true"><Icon name="plus" size={24} /></span>
                    <span className="hero-text">
                      <span className="hero-title">{t.home.createTitle}</span>
                      <span className="hero-sub">{t.home.createSub}</span>
                      <span className="hero-formats">{t.add.v2.formats}</span>
                    </span>
                    <Illustration name="accueil" fallback="papier" className="hero-art" eager />
                    <span className="hero-arrow" aria-hidden="true"><Icon name="arrow" size={22} /></span>
                  </>
                ) : (
                  <>
                    <Illustration name="import" fallback="papier" className="upload-art" eager />
                    <span className="upload-icon" aria-hidden="true"><Icon name="plus" size={30} /></span>
                    <span className="upload-title">{items.length ? t.add.addMore : t.add.v2.addDocuments}</span>
                    <span className="upload-sub">{t.add.v2.formats}</span>
                  </>
                )}
              </label>
            )}
            {items.length > 0 && (
              <>
                <ul className="filelist" aria-label={t.add.files}>
                  {items.map((it) => {
                    const name = it.prepared?.title ?? it.file.name;
                    return (
                      <li key={it.key} className={`fileline${it.status === "error" ? " is-error" : ""}`}>
                        <span className={`fileline-icon fmt-${(it.file.name.split(".").pop() ?? "").toLowerCase().slice(0, 5)}`} aria-hidden="true">
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
                        {it.status === "ready" && <span className="fileline-ok" aria-hidden="true"><Icon name="check-circle" size={22} /></span>}
                        <span className="fileline-actions">
                          {it.status === "error" && !it.rejected && (
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
                {failedItems.length > 0 && <p className="notice notice-warn small" role="status">{t.add.blockedByError}</p>}
              </>
            )}
            {consoleNote && <p className="import-note" role="alert">{consoleNote}</p>}
        </>
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

      {(!hero || items.length > 0) && (
      <>
      <fieldset className="modes supports" disabled={busy} aria-describedby={`${base}-sup-count`}>
        <legend>{t.add.v2.supportsTitle}</legend>
        <p className="modes-sub">{t.add.v2.supportsSub}</p>
        <div className="mode-grid support-grid">
          {SUPPORTS.map((m) => {
            const on = supports.includes(m);
            return (
              <label key={m} className={`mode-card support-card${on ? " is-selected" : ""}`}>
                <input type="checkbox" className="support-check" name={`${base}-supports`} value={m} checked={on} onChange={() => toggleSupport(m)} aria-describedby={`${base}-sup-${m}`} />
                <span className="mode-ic" aria-hidden="true"><Icon name={SUPPORT_ICONS[m]} size={28} /></span>
                <span className="mode-txt">
                  <strong>{t.add.v2.supports[m]?.title}</strong>
                  <span id={`${base}-sup-${m}`} className="mode-desc">{t.add.v2.supports[m]?.desc}</span>
                </span>
                <span className="support-tick" aria-hidden="true">{on && <Icon name="check" size={16} />}</span>
              </label>
            );
          })}
        </div>
        <p id={`${base}-sup-count`} className="support-count" aria-live="polite">
          {needOne ? <span className="support-need">{t.add.v2.supportsNeedOne}</span> : t.add.v2.supportsCount(supports.length)}
        </p>
      </fieldset>

      <p role="status" aria-live="polite" className="sr-only">{status}</p>
      {/* Le fichier n'est reçu qu'après l'envoi : jamais de faux « Document reçu » avant. */}
      {items.some((it) => it.status === "upload") && <p className="fl-info"><Icon name="info" size={18} /> <span>{t.fluid.tracker.uploading}</span></p>}
      {error && billing?.code === "credits" && typeof billing.needed === "number" ? (
        <InsufficientCreditsState needed={billing.needed} available={billing.available ?? 0} topup={billing.topup} />
      ) : error && (
        <div className="notice notice-error" role="alert">
          <p>{error}</p>
          {billing && (
            <div className="billing-cta">
              <Link href="/offres" className="btn btn-primary">{t.billing.seeOffers}</Link>
              {billing.topup && <Link href={billing.topup} className="btn">{t.billing.topup}</Link>}
            </div>
          )}
        </div>
      )}
      <div className="estimate">
        <span className="estimate-icon" aria-hidden="true"><Icon name="coins" size={26} /></span>
        <span className="estimate-text">
          <b className={staleQuote ? "is-stale" : undefined}>
            {count === 1 ? (quote ? t.add.v2.estimate(quote) : staleQuote ? t.add.v2.estimate(staleQuote.credits) : t.billing.createCostFrom(ACTION_PRICES.report_short)) : t.add.v2.estimateMany(count)}
          </b>
          {staleQuote ? <small aria-live="polite">{t.add.v2.estimateUpdating}</small> : count === 1 && quote && quoted && quoted.extras > 0 ? <small>{t.add.v2.estimateSupports(quoted.extras)}</small> : null}
          {pages > 0 && <small>{t.add.v2.estimatePages(pages)}</small>}
        </span>
        <button
          type="submit"
          className={`btn btn-primary${phase.step !== "idle" ? " busy" : ""}`}
          disabled={!ready}
          aria-describedby={missing ? `${base}-missing` : undefined}
        >
          {phase.step === "creating" ? t.add.creating : count > 1 ? t.add.createMany(count) : t.add.v2.create}
        </button>
      </div>
      {missing && <p id={`${base}-missing`} className="muted small center">{missing}</p>}
      <p className="retention"><Icon name="shield" size={14} /> {t.add.v2.retention}</p>
      </>
      )}
    </form>
  );
}
