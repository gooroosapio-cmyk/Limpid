"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { useT } from "@/lib/i18n/client";

interface DrawerReport {
  id: string;
  title: string;
  state: "ready" | "updating" | "preparing";
  unread: boolean;
  folderId: string | null;
}
interface DrawerData {
  folders: { id: string; name: string }[];
  reports: DrawerReport[];
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
function DrawerPanel({ email, data, onClose }: { email: string; data: DrawerData | null; onClose?: () => void }) {
  const t = useT();
  const pathname = usePathname();
  const search = useSearchParams();
  const atLibrary = pathname === "/" && !search.get("dossier") && !search.get("vue");
  const items: { href: string; label: string; icon: IconName; current: boolean }[] = [
    { href: "/", label: t.nav.home, icon: "home", current: atLibrary },
    { href: "/ajouter", label: t.nav.newLimpid, icon: "plus", current: pathname === "/ajouter" },
    { href: "/?nouveau-dossier=1", label: t.nav.newFolder, icon: "folder-plus", current: false },
    { href: "/parametres", label: t.nav.settings, icon: "settings", current: pathname === "/parametres" },
  ];
  return (
    <div className="drawer-panel">
      <div className="drawer-head">
        {onClose && (
          <button type="button" className="ib" aria-label={t.nav.closeMenu} onClick={onClose}>
            <Icon name="close" />
          </button>
        )}
        <Brand />
      </div>
      <nav className="drawer-nav" aria-label={t.nav.main}>
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="drawer-link" aria-current={i.current ? "page" : undefined}>
            <Icon name={i.icon} /> {i.label}
          </Link>
        ))}
      </nav>
      {data && data.folders.length > 0 && (
        <>
          <p className="drawer-title drawer-label">{t.nav.folders}</p>
          <ul className="drawer-list drawer-folders" aria-label={t.nav.folders}>
            {data.folders.map((f) => (
              <li key={f.id}>
                <Link href={`/?dossier=${f.id}`} aria-current={search.get("dossier") === f.id ? "page" : undefined}>
                  <Icon name="folder" size={18} /> <span className="t">{f.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <Link href="/" className="drawer-title" aria-current={atLibrary ? "page" : undefined}>
        {t.nav.library} <span>{t.nav.seeAll}</span>
      </Link>
      <ul className="drawer-list" aria-label={t.nav.library}>
        {data === null ? (
          <li aria-hidden="true"><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /></li>
        ) : data.reports.length === 0 ? (
          <li className="drawer-empty">{t.nav.libraryEmpty}</li>
        ) : (
          data.reports.map((r) => (
            <li key={r.id}>
              <Link href={`/rapports/${r.id}`} aria-current={pathname === `/rapports/${r.id}` ? "page" : undefined}>
                <span className="t">{r.title}</span>
                {r.state !== "ready" ? (
                  <span className="drawer-state" role="img" aria-label={t.nav.preparing}><Icon name="hourglass" size={16} /></span>
                ) : (
                  r.unread && <span className="unread-dot" role="img" aria-label={t.nav.unread} />
                )}
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
export function AppShell({ email }: { email: string }) {
  const t = useT();
  const pathname = usePathname();
  const search = useSearchParams();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<DrawerData | null>(null);
  const [scrolled, setScrolled] = useState(false);

  const load = useCallback(() => {
    fetch("/api/reports", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { folders: [], reports: [] }))
      .then((d: DrawerData) => setData(d))
      .catch(() => setData((prev) => prev ?? { folders: [], reports: [] }));
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
          aria-label={t.nav.menu}
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
          <Link href="/compte" className="ib" aria-label={t.nav.profile} aria-current={pathname === "/compte" ? "page" : undefined}>
            <span className="avatar" aria-hidden="true">{initials(email)}</span>
          </Link>
          <Link href="/parametres" className="ib" aria-label={t.nav.settings} aria-current={pathname === "/parametres" ? "page" : undefined}>
            <Icon name="settings" />
          </Link>
        </div>
      </header>
      <aside className="sidebar" aria-label={t.nav.main}>
        <DrawerPanel email={email} data={data} />
      </aside>
      <dialog
        ref={dialogRef}
        className="drawer"
        aria-label={t.nav.main}
        onClick={(e) => {
          // Toucher le fond ferme le menu.
          if (e.target === e.currentTarget) dialogRef.current?.close();
        }}
      >
        <DrawerPanel email={email} data={data} onClose={() => dialogRef.current?.close()} />
      </dialog>
    </>
  );
}

/** Bouton flottant : nouveau document à expliquer. */
export function Fab() {
  const t = useT();
  return (
    <Link href="/ajouter" className="fab">
      <Icon name="plus" />
      <span className="fab-label">{t.nav.fab}</span>
    </Link>
  );
}
