"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Logo";
import { useT } from "@/lib/i18n/client";
import { initials } from "@/lib/initials";
import { SideMenu } from "@/components/shell/SideMenu";
import { useKeyboardState } from "@/components/shell/keyboard";

/**
 * En-tête compact : bouton du menu (mobile), logo vers l'Accueil, cloche (notifications
 * réelles) et avatar du profil en haut à droite.
 */
function AppHeader({ email, menuOpen, onMenu }: { email: string; menuOpen: boolean; onMenu: () => void }) {
  const t = useT();
  const pathname = usePathname();
  const [state, setState] = useState<{ unread: number; name: string | null }>({ unread: 0, name: null });
  // Pastille et nom relus à chaque changement d'écran (une requête légère, sans contenu).
  useEffect(() => {
    let live = true;
    fetch("/api/notifications", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { unread: number; name: string | null } | null) => live && d && setState({ unread: d.unread, name: d.name }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [pathname]);
  return (
    <header className="appbar">
      <button
        type="button"
        className="icon-button appbar-menu"
        aria-label={menuOpen ? t.v4.menu.close : t.v4.menu.open}
        aria-expanded={menuOpen}
        aria-controls="side-menu"
        onClick={onMenu}
      >
        <Icon name={menuOpen ? "close" : "lines"} size={22} />
      </button>
      <Link href="/" className="brand-link" aria-label={t.common.brandHome}>
        <span className="brand">
          <Wordmark />
        </span>
      </Link>
      <div className="appbar-end">
        <Link
          href="/notifications"
          className="ib appbar-bell"
          aria-label={state.unread ? t.notifications.labelUnread(state.unread) : t.notifications.title}
          aria-current={pathname === "/notifications" ? "page" : undefined}
        >
          <Icon name="bell" size={22} />
          {state.unread > 0 && <span className="bell-dot" aria-hidden="true" />}
        </Link>
        <Link href="/compte" className="appbar-avatar" aria-label={t.nav.profile} aria-current={pathname === "/compte" ? "page" : undefined}>
          <span className="avatar" aria-hidden="true">{initials(state.name, email)}</span>
        </Link>
      </div>
    </header>
  );
}

/**
 * Coquille de l'application connectée : en-tête et menu latéral gauche (toujours visible sur
 * ordinateur, tiroir sur mobile). Plus de barre de navigation fixe en bas. La lecture et
 * l'aperçu d'une leçon masquent la coquille (cf. styles).
 */
export function AppShell({ email }: { email: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  // Clavier virtuel ouvert : la discussion passe en plein écran (cf. styles).
  useKeyboardState();
  // Changement d'écran : le tiroir se referme.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- suit la navigation
  useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <AppHeader email={email} menuOpen={open} onMenu={() => setOpen((v) => !v)} />
      <SideMenu open={open} onClose={close} />
    </>
  );
}
