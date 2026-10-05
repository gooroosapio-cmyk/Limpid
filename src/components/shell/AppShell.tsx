"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { fr } from "@/lib/i18n/fr";

interface DrawerReport {
  id: string;
  title: string;
  state: "ready" | "updating" | "preparing" | "failed";
}

function initials(email: string): string {
  const parts = (email.split("@")[0] ?? "").split(/[._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase() || "?";
}

function Brand() {
  return (
    <Link href="/" className="brand-link" aria-label="Limpid, bibliothèque">
      <span className="brand">
        <LogoMark />
        <b>limpid</b>
      </span>
    </Link>
  );
}

/** Contenu du menu latéral (identique en volet et en barre latérale). */
function DrawerPanel({
  email,
  urlEnabled,
  reports,
  onClose,
}: {
  email: string;
  urlEnabled: boolean;
  reports: DrawerReport[] | null;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const mode = pathname === "/ajouter" ? (search.get("mode") ?? "") : null;
  const items: { href: string; label: string; icon: IconName; current: boolean }[] = [
    { href: "/ajouter", label: fr.nav.home, icon: "home", current: mode === "" },
    { href: "/ajouter?mode=texte", label: fr.nav.addText, icon: "list", current: mode === "texte" },
    { href: "/ajouter?mode=fichier", label: fr.nav.addPdf, icon: "file", current: mode === "fichier" },
    ...(urlEnabled ? [{ href: "/ajouter?mode=lien", label: fr.nav.addLink, icon: "link" as IconName, current: mode === "lien" }] : []),
    { href: "/parametres", label: fr.nav.settings, icon: "settings", current: pathname === "/parametres" },
  ];
  return (
    <div className="drawer-panel">
      <div className="drawer-head">
        {onClose && (
          <button type="button" className="ib" aria-label={fr.nav.closeMenu} onClick={onClose}>
            <Icon name="close" />
          </button>
        )}
        <Brand />
      </div>
      <nav className="drawer-nav" aria-label={fr.nav.main}>
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="drawer-link" aria-current={i.current ? "page" : undefined}>
            <Icon name={i.icon} /> {i.label}
          </Link>
        ))}
      </nav>
      <Link href="/" className="drawer-title" aria-current={pathname === "/" ? "page" : undefined}>
        {fr.nav.library} <span>{fr.nav.seeAll}</span>
      </Link>
      <ul className="drawer-list" aria-label={fr.nav.library}>
        {reports === null ? (
          <li aria-hidden="true"><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /></li>
        ) : reports.length === 0 ? (
          <li className="drawer-empty">{fr.nav.libraryEmpty}</li>
        ) : (
          reports.map((r) => (
            <li key={r.id}>
              <Link href={`/rapports/${r.id}`} aria-current={pathname === `/rapports/${r.id}` ? "page" : undefined}>
                <span className="t">{r.title}</span>
                {(r.state === "preparing" || r.state === "updating") && <span className="dot" role="img" aria-label={fr.nav.preparing} />}
                {r.state === "failed" && <span className="dot ko" role="img" aria-label={fr.nav.failed} />}
              </Link>
            </li>
          ))
        )}
      </ul>
      <div className="drawer-foot">
        <Link href="/compte" className="drawer-link" aria-current={pathname === "/compte" ? "page" : undefined}>
          <span className="avatar" aria-hidden="true">{initials(email)}</span>
          <span>{email}</span>
        </Link>
      </div>
    </div>
  );
}

/**
 * Coquille de l'application connectée : barre d'en-tête (menu, logo, profil, paramètres),
 * menu latéral en volet (< 1200 px) ou en barre fixe (≥ 1200 px). Pas de flèche de retour :
 * le retour est celui du téléphone ou du navigateur.
 */
export function AppShell({ email, urlEnabled }: { email: string; urlEnabled: boolean }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reports, setReports] = useState<DrawerReport[] | null>(null);
  const [scrolled, setScrolled] = useState(false);

  const load = useCallback(() => {
    fetch("/api/reports", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { reports: [] }))
      .then((d: { reports: DrawerReport[] }) => setReports(d.reports))
      .catch(() => setReports((prev) => prev ?? []));
  }, []);

  // La liste suit les créations et suppressions : rechargée à chaque changement d'écran.
  useEffect(() => {
    load();
    dialogRef.current?.close();
  }, [pathname, search, load]);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <>
      <header className={scrolled ? "appbar scrolled" : "appbar"}>
        <button
          type="button"
          className="ib menu-button"
          aria-label={fr.nav.menu}
          aria-haspopup="dialog"
          onClick={() => {
            load();
            dialogRef.current?.showModal();
          }}
        >
          <Icon name="list" />
        </button>
        <Brand />
        <div className="appbar-end">
          <Link href="/compte" className="ib" aria-label={fr.nav.profile} aria-current={pathname === "/compte" ? "page" : undefined}>
            <span className="avatar" aria-hidden="true">{initials(email)}</span>
          </Link>
          <Link href="/parametres" className="ib" aria-label={fr.nav.settings} aria-current={pathname === "/parametres" ? "page" : undefined}>
            <Icon name="settings" />
          </Link>
        </div>
      </header>
      <aside className="sidebar" aria-label={fr.nav.main}>
        <DrawerPanel email={email} urlEnabled={urlEnabled} reports={reports} />
      </aside>
      <dialog
        ref={dialogRef}
        className="drawer"
        aria-label={fr.nav.main}
        onClick={(e) => {
          // Toucher le fond ferme le menu.
          if (e.target === e.currentTarget) dialogRef.current?.close();
        }}
      >
        <DrawerPanel email={email} urlEnabled={urlEnabled} reports={reports} onClose={() => dialogRef.current?.close()} />
      </dialog>
    </>
  );
}

/** Bouton flottant : nouveau document à expliquer. */
export function Fab() {
  return (
    <Link href="/ajouter" className="fab">
      <Icon name="plus" />
      <span className="fab-label">{fr.nav.fab}</span>
    </Link>
  );
}
