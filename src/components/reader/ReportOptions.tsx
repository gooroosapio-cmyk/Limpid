"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { fr } from "@/lib/i18n/fr";

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
 * Options du rapport (kit V3, écran 24) : les actions rares, hors du récit. Volet en bas
 * d'écran sur mobile, panneau latéral sur ordinateur.
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
}: {
  reportId: string | null;
  pdfHref: string;
  originalHref: string | null;
  sourceTitle: string;
  themeLabel: string;
  themeControl?: React.ReactNode;
  versions?: VersionLink[];
  offline?: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<"menu" | "theme" | "versions">("menu");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);
  const router = useRouter();

  async function remove() {
    if (!reportId || !window.confirm(fr.reports.deleteConfirm)) return;
    setDeleting(true);
    setError(false);
    const res = await fetch(`/api/reports/${reportId}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      router.push("/bibliotheque");
      router.refresh();
    } else {
      setError(true);
      setDeleting(false);
    }
  }

  const back = (
    <button type="button" className="ib" aria-label={fr.options.back} onClick={() => setView("menu")}><Icon name="back" /></button>
  );

  return (
    <>
      <button
        type="button"
        className="ib"
        aria-label={fr.options.open}
        aria-haspopup="dialog"
        onClick={() => {
          setView("menu");
          dialogRef.current?.showModal();
        }}
      >
        <Icon name="more" />
      </button>
      <dialog ref={dialogRef} className="sheet side" aria-labelledby="options-title">
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          {view !== "menu" && back}
          <h2 id="options-title">{view === "theme" ? fr.options.presentation : view === "versions" ? fr.options.versions : fr.options.open}</h2>
          <form method="dialog">
            <button className="ib" aria-label={fr.reader.close}><Icon name="close" /></button>
          </form>
        </div>

        {view === "menu" && (
          <div className="stagger" key="menu">
            <ul className="rows">
              <Row icon="download" title={fr.options.export} sub={fr.options.exportSub} href={pdfHref} download />
              {themeControl && <Row icon="settings" title={fr.options.presentation} sub={themeLabel} onClick={() => setView("theme")} />}
              {originalHref ? (
                <Row icon="file" title={fr.options.source} sub={sourceTitle} href={originalHref} />
              ) : (
                <li className="row row-static">
                  <span className="row-icon"><Icon name="file" /></span>
                  <span className="row-text"><b>{fr.options.sourceMissing}</b><small>{sourceTitle}</small></span>
                </li>
              )}
              {offline}
              {versions && versions.length > 1 && (
                <Row icon="clock" title={fr.options.versions} sub={fr.options.versionsSub(versions.length)} onClick={() => setView("versions")} />
              )}
              {reportId && (
                <Row icon="trash" title={deleting ? fr.reports.deleting : fr.options.delete} sub={fr.options.deleteSub} onClick={remove} danger />
              )}
            </ul>
            {error && <p className="notice notice-error" role="alert">La suppression a échoué. Réessayez.</p>}
            <p className="muted small">{fr.options.retention}</p>
          </div>
        )}
        {view === "theme" && <div className="stagger" key="theme">{themeControl}</div>}
        {view === "versions" && versions && (
          <ul className="rows stagger" key="versions">
            {versions.map((v) => (
              <li key={v.href}>
                <Link className="row" href={v.href} aria-current={v.current ? "page" : undefined} onClick={() => dialogRef.current?.close()}>
                  <span className="row-icon"><Icon name={v.current ? "check" : "clock"} /></span>
                  <span className="row-text"><b>{v.label}</b></span>
                  <Icon name="chevron" className="row-chevron" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </dialog>
    </>
  );
}
