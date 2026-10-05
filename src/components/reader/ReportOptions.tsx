"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";

interface VersionLink {
  href: string;
  label: string;
  current: boolean;
}

function Row({ icon, title, sub, href, download, onClick, danger }: {
  icon: IconName;
  title: string;
  sub?: string;
  href?: string;
  download?: boolean;
  onClick?: () => void;
  danger?: boolean;
}) {
  const inner = (
    <>
      <span className="row-icon"><Icon name={icon} /></span>
      <span className="row-text"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      <Icon name="chevron" className="row-chevron" />
    </>
  );
  const cls = danger ? "row row-danger" : "row";
  return (
    <li>
      {href ? (
        <a className={cls} href={href} {...(download ? { download: true } : { target: "_blank", rel: "noopener" })}>{inner}</a>
      ) : (
        <button type="button" className={cls} onClick={onClick}>{inner}</button>
      )}
    </li>
  );
}

/**
 * Options du rapport (kit V3, écran 24), affichées dans le volet Sommaire : les actions rares,
 * hors du récit. Sous-vues Présentation et Versions dans le même volet.
 */
export function ReportOptions({
  reportId,
  pdfHref,
  originalHref,
  sourceTitle,
  themeLabel,
  themeControl,
  versions,
  offline,
  onNavigate,
}: {
  reportId: string | null;
  pdfHref: string;
  originalHref: string | null;
  sourceTitle: string;
  themeLabel: string;
  themeControl?: React.ReactNode;
  versions?: VersionLink[];
  offline?: React.ReactNode;
  /** Ferme le volet avant de changer de version. */
  onNavigate?: () => void;
}) {
  const t = useT();
  const [view, setView] = useState<"menu" | "theme" | "versions">("menu");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);
  const router = useRouter();

  async function remove() {
    if (!reportId || !window.confirm(t.reports.deleteConfirm)) return;
    setDeleting(true);
    setError(false);
    const res = await fetch(`/api/reports/${reportId}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError(true);
      setDeleting(false);
    }
  }

  if (view !== "menu")
    return (
      <div className="stagger" key={view}>
        <div className="sheet-sub">
          <button type="button" className="btn-link" onClick={() => setView("menu")}>
            <Icon name="back" size={18} /> {t.options.back}
          </button>
          <h3>{view === "theme" ? t.options.presentation : t.options.versions}</h3>
        </div>
        {view === "theme" && themeControl}
        {view === "versions" && versions && (
          <ul className="rows">
            {versions.map((v) => (
              <li key={v.href}>
                <Link className="row" href={v.href} aria-current={v.current ? "page" : undefined} onClick={onNavigate}>
                  <span className="row-icon"><Icon name={v.current ? "check" : "clock"} /></span>
                  <span className="row-text"><b>{v.label}</b></span>
                  <Icon name="chevron" className="row-chevron" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );

  return (
    <div>
      <ul className="rows">
        <Row icon="download" title={t.options.export} sub={t.options.exportSub} href={pdfHref} download />
        {themeControl && <Row icon="settings" title={t.options.presentation} sub={themeLabel} onClick={() => setView("theme")} />}
        {originalHref ? (
          <Row icon="file" title={t.options.source} sub={sourceTitle} href={originalHref} />
        ) : (
          <li className="row row-static">
            <span className="row-icon"><Icon name="file" /></span>
            <span className="row-text"><b>{t.options.sourceMissing}</b><small>{sourceTitle}</small></span>
          </li>
        )}
        {offline}
        {versions && versions.length > 1 && (
          <Row icon="clock" title={t.options.versions} sub={t.options.versionsSub(versions.length)} onClick={() => setView("versions")} />
        )}
        {reportId && <Row icon="trash" title={deleting ? t.reports.deleting : t.options.delete} sub={t.options.deleteSub} onClick={remove} danger />}
      </ul>
      {error && <p className="notice notice-error" role="alert">La suppression a échoué. Réessayez.</p>}
      <p className="muted small">{t.options.retention}</p>
    </div>
  );
}
