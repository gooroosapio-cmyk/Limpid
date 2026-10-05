"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { useDialogHistory } from "@/components/shell/useDialogHistory";
import { useT } from "@/lib/i18n/client";

function initials(email: string): string {
  const parts = (email.split("@")[0] ?? "").split(/[._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase() || "?";
}

/** En-tête compact (AppHeader) : logo à gauche, profil à droite. Pas de cloche : aucun système de notifications. */
function AppHeader({ email }: { email: string }) {
  const t = useT();
  const pathname = usePathname();
  return (
    <header className="appbar">
      <Link href="/" className="brand-link" aria-label={t.common.brandHome}>
        <span className="brand">
          <LogoMark />
          <b>limpid</b>
        </span>
      </Link>
      <Link href="/compte" className="appbar-avatar" aria-label={t.nav.profile} aria-current={pathname === "/compte" ? "page" : undefined}>
        <span className="avatar" aria-hidden="true">{initials(email)}</span>
      </Link>
    </header>
  );
}

/** Feuille « Créer » : importer, créer depuis un lien ou un texte, nouveau dossier. */
function CreateSheet({ dialog }: { dialog: React.RefObject<HTMLDialogElement | null> }) {
  const t = useT();
  const c = t.shell.create;
  const items: { href: string; icon: IconName; title: string; sub: string }[] = [
    { href: "/ajouter", icon: "file", title: c.import[0], sub: c.import[1] },
    { href: "/ajouter?mode=lien", icon: "link", title: c.link[0], sub: c.link[1] },
    { href: "/ajouter?mode=texte", icon: "lines", title: c.text[0], sub: c.text[1] },
    { href: "/?nouveau-dossier=1", icon: "folder-plus", title: c.folder[0], sub: c.folder[1] },
  ];
  return (
    <dialog
      ref={dialog}
      className="sheet create-sheet"
      aria-labelledby="create-sheet-h"
      onClick={(e) => {
        if (e.target === e.currentTarget) dialog.current?.close();
      }}
    >
      <div className="sheet-grip" aria-hidden="true" />
      <div className="sheet-head">
        <h2 id="create-sheet-h">{c.title}</h2>
        <button type="button" className="ib" aria-label={t.reader.close} onClick={() => dialog.current?.close()}>
          <Icon name="close" />
        </button>
      </div>
      <ul className="rows">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="row" onClick={() => dialog.current?.close()}>
              <span className="row-icon"><Icon name={i.icon} /></span>
              <span className="row-text"><b>{i.title}</b><small>{i.sub}</small></span>
              <Icon name="chevron" className="row-chevron" />
            </Link>
          </li>
        ))}
      </ul>
    </dialog>
  );
}

/** Barre basse flottante (BottomNavigation) : Bibliothèque, Créer (feuille), Profil. */
function BottomNavigation() {
  const t = useT();
  const pathname = usePathname();
  const sheet = useRef<HTMLDialogElement>(null);
  useDialogHistory(sheet);
  const atLibrary = pathname === "/" || pathname.startsWith("/preparations") || pathname.startsWith("/sources");
  const atCreate = pathname.startsWith("/ajouter");
  const atProfile = ["/compte", "/parametres", "/offres", "/paiement", "/admin", "/a-propos"].some((p) => pathname.startsWith(p));
  return (
    <>
      <nav className="bottomnav" aria-label={t.nav.main}>
        <Link href="/" className="bottomnav-item" aria-current={atLibrary ? "page" : undefined}>
          <Icon name="book" size={24} />
          <span>{t.nav.library}</span>
        </Link>
        <button
          type="button"
          className="bottomnav-item"
          aria-haspopup="dialog"
          aria-current={atCreate ? "page" : undefined}
          onClick={() => sheet.current?.showModal()}
        >
          <Icon name="plus-circle" size={24} />
          <span>{t.shell.createLabel}</span>
        </button>
        <Link href="/compte" className="bottomnav-item" aria-current={atProfile ? "page" : undefined}>
          <Icon name="user" size={24} />
          <span>{t.nav.profile}</span>
        </Link>
      </nav>
      <CreateSheet dialog={sheet} />
    </>
  );
}

/**
 * Coquille de l'application connectée (V2) : en-tête compact et barre basse flottante à trois
 * destinations. La lecture et l'aperçu d'une leçon les masquent (navigation propre, cf. v2.css).
 */
export function AppShell({ email }: { email: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  // Changement d'écran : toute feuille encore ouverte est refermée.
  useEffect(() => {
    document.querySelectorAll<HTMLDialogElement>("dialog.create-sheet[open]").forEach((d) => d.close());
  }, [pathname, search]);
  return (
    <>
      <AppHeader email={email} />
      <BottomNavigation />
    </>
  );
}
