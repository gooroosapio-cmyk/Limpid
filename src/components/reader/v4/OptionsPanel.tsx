"use client";

import { walletChanged } from "@/components/billing/wallet-store";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { ComfortSettings } from "@/components/account/DisplaySettings";
import { MODES, type Mode } from "@/lib/contracts/schemas";
import { DISPLAY_COOKIES, setDisplayPref, type DisplayPrefs, type TextSize } from "@/lib/display/prefs";
import { apiMessage } from "@/lib/i18n/api";
import { useLang, useT } from "@/lib/i18n/client";
import { OfflineSave } from "../OfflineSave";
import { downloadPdf } from "../pdf-download";

export interface OptionsData {
  reportId: string | null;
  title: string;
  pdfHref: string;
  hasExercises: boolean;
  sourceTitle: string;
  mode: Mode | null;
  versions: { href: string; number: number; mode: Mode | null; createdAt: string; current: boolean; shown: boolean }[];
  /** Clé hors connexion du compte (null : démonstration). */
  offlineAccount: string | null;
  display: DisplayPrefs;
}

type View = "menu" | "export" | "display" | "version" | "versions";

function Row({ icon, title, sub, onClick, href, danger, external }: { icon: IconName; title: string; sub?: string; onClick?: () => void; href?: string; danger?: boolean; external?: boolean }) {
  const inner = (
    <>
      <span className="row-icon"><Icon name={icon} /></span>
      <span className="row-text"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      <Icon name="chevron" className="row-chevron" />
    </>
  );
  return (
    <li>
      {href ? (
        <a
          className={danger ? "row row-danger" : "row"}
          href={href}
          {...(external ? { target: "_blank", rel: "noopener" } : {})}
          onClick={
            onClick
              ? (e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                  e.preventDefault();
                  onClick();
                }
              : undefined
          }
        >
          {inner}
        </a>
      ) : (
        <button type="button" className={danger ? "row row-danger" : "row"} onClick={onClick}>{inner}</button>
      )}
    </li>
  );
}

/** Taille de lecture (kit V5) : 16, 18 ou 20 px, sans régénérer le cours. */
const READING_SIZES: { px: number; value: TextSize }[] = [
  { px: 16, value: "standard" },
  { px: 18, value: "grand" },
  { px: 20, value: "tres-grand" },
];

function ReadingSize({ initial }: { initial: TextSize }) {
  const t = useT();
  const [text, setText] = useState<TextSize>(initial === "petit" ? "standard" : initial);
  return (
    <div className="setting setting-sizes">
      <span><b>{t.lim.textSize}</b></span>
      <div className="seg" role="radiogroup" aria-label={t.lim.textSize}>
        {READING_SIZES.map((s) => (
          <button
            key={s.px}
            type="button"
            role="radio"
            aria-checked={text === s.value}
            onClick={() => {
              setText(s.value);
              setDisplayPref(DISPLAY_COOKIES.text, s.value === "standard" ? null : s.value, "data-text", s.value === "standard" ? null : s.value);
            }}
          >
            {s.px} px
          </button>
        ))}
      </div>
    </div>
  );
}

/** Options du Limpid (V4, § 8) : actions rares, distinctes de la lecture. */
export function OptionsPanel({
  data,
  onNavigate,
  annexHref,
  onAnnex,
}: {
  data: OptionsData;
  onNavigate: () => void;
  /** Page Annexes du rapport, à une ancre (Annexes, Sources, Glossaire). */
  annexHref: (hash: string) => string;
  onAnnex: (hash: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const [view, setView] = useState<View>("menu");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const when = (iso: string) =>
    new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const modeName = (m: Mode | null) => (m ? (t.add.modes[m]?.title ?? m) : "—");

  async function newVersion(mode: Mode) {
    if (!data.reportId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${data.reportId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variation: "mode", mode, idempotency_key: crypto.randomUUID() }),
      });
      const body = await res.json().catch(() => ({}));
      walletChanged();
      if (!res.ok) throw new Error(apiMessage(t, body, t.versions.failed));
      setMessage(t.lim.requested);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!data.reportId || !window.confirm(t.reports.deleteConfirm)) return;
    setBusy(true);
    const res = await fetch(`/api/reports/${data.reportId}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      router.push("/bibliotheque");
      router.refresh();
    } else {
      setError(t.common.deleteFailed);
      setBusy(false);
    }
  }

  const back = (title: string) => (
    <div className="sheet-sub">
      <button type="button" className="btn-link" onClick={() => setView("menu")}>
        <Icon name="back" size={18} /> {t.options.back}
      </button>
      <h3>{title}</h3>
    </div>
  );

  if (view === "export")
    return (
      <div className="stagger" key="export">
        {back(t.lim.optExport)}
        <ul className="rows">
          <Row icon="download" title={t.lim.exportContent} href={data.pdfHref} onClick={() => void downloadPdf(data.pdfHref, t)} />
          {data.hasExercises && <Row icon="quiz" title={t.lim.exportExercises} href={`${data.pdfHref}${data.pdfHref.includes("?") ? "&" : "?"}exercices=1`} onClick={() => void downloadPdf(`${data.pdfHref}${data.pdfHref.includes("?") ? "&" : "?"}exercices=1`, t)} />}
          {data.hasExercises && <Row icon="check" title={t.lim.exportKey} href={`${data.pdfHref}${data.pdfHref.includes("?") ? "&" : "?"}corrige=1`} onClick={() => void downloadPdf(`${data.pdfHref}${data.pdfHref.includes("?") ? "&" : "?"}corrige=1`, t)} />}
        </ul>
        <p className="muted small">{t.lim.exportNote}</p>
      </div>
    );

  if (view === "display")
    return (
      <div className="stagger" key="display">
        {back(t.lim.optDisplay)}
        <ReadingSize initial={data.display.text} />
        <ComfortSettings initial={data.display} withSize={false} />
      </div>
    );

  if (view === "version")
    return (
      <div className="stagger" key="version">
        {back(t.lim.optNewVersion)}
        <p className="muted small">{t.lim.keptNote}</p>
        <ul className="rows">
          {MODES.map((m) => (
            <li key={m}>
              <button type="button" className="row" disabled={busy || !data.reportId} onClick={() => newVersion(m)}>
                <span className="row-icon"><Icon name={m === data.mode ? "check" : "spark"} /></span>
                <span className="row-text">
                  <b>{t.add.modes[m]?.title}{m === data.mode ? ` (${t.lim.currentMode})` : ""}</b>
                  <small>{t.add.modes[m]?.desc}</small>
                </span>
                <Icon name="chevron" className="row-chevron" />
              </button>
            </li>
          ))}
        </ul>
        {message && <p className="notice notice-ok" role="status">{message}</p>}
        {error && <p className="notice notice-error" role="alert">{error}</p>}
      </div>
    );

  if (view === "versions")
    return (
      <div className="stagger" key="versions">
        {back(t.lim.optVersions)}
        <ul className="rows">
          {data.versions.map((v) => (
            <li key={v.href}>
              <Link className="row" href={v.href} aria-current={v.shown ? "page" : undefined} onClick={onNavigate}>
                <span className="row-icon"><Icon name={v.shown ? "check" : "clock"} /></span>
                <span className="row-text"><b>{t.lim.versionLine(v.number, modeName(v.mode), when(v.createdAt))}</b></span>
                <Icon name="chevron" className="row-chevron" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div>
      <ul className="rows">
        <Row icon="download" title={t.lim.optExport} sub={t.lim.optExportSub} onClick={() => setView("export")} />
        <Row icon="eye" title={t.lim.optDisplay} sub={t.lim.optDisplaySub} onClick={() => setView("display")} />
        <Row icon="list" title={t.lim.optAnnexes} sub={t.lim.optAnnexesSub} href={annexHref("annexes")} onClick={() => onAnnex("annexes")} />
        <Row icon="file" title={t.lim.optSources} sub={data.sourceTitle} href={annexHref("sources")} onClick={() => onAnnex("sources")} />
        <Row icon="book" title={t.lim.optGlossary} href={annexHref("glossaire")} onClick={() => onAnnex("glossaire")} />
        {data.reportId && <Row icon="spark" title={t.lim.optNewVersion} sub={t.lim.optNewVersionSub} onClick={() => setView("version")} />}
        {data.versions.length > 1 && <Row icon="clock" title={t.lim.optVersions} sub={t.options.versionsSub(data.versions.length)} onClick={() => setView("versions")} />}
        {data.offlineAccount && data.reportId && <OfflineSave account={data.offlineAccount} path={`/rapports/${data.reportId}`} title={data.title} />}
        {data.reportId && <Row icon="trash" title={t.options.delete} sub={t.options.deleteSub} onClick={remove} danger />}
      </ul>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <p className="muted small">{t.options.retention}</p>
    </div>
  );
}
