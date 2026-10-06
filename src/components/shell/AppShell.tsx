"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Logo";
import { useT } from "@/lib/i18n/client";
import { initials } from "@/lib/initials";
import { useKeyboardState } from "@/components/shell/keyboard";
import { navSection } from "@/components/shell/nav";

/** En-tête compact (AppHeader) : logo, cloche (notifications réelles), avatar vers le profil. */
function AppHeader({ email }: { email: string }) {
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
          <Icon name="bell" size={26} />
          {state.unread > 0 && <span className="bell-dot" aria-hidden="true" />}
        </Link>
        <Link href="/compte" className="appbar-avatar" aria-label={t.nav.profile} aria-current={pathname === "/compte" ? "page" : undefined}>
          <span className="avatar" aria-hidden="true">{initials(state.name, email)}</span>
        </Link>
      </div>
    </header>
  );
}

const NAV = [
  { key: "home", href: "/", icon: "home" },
  { key: "library", href: "/bibliotheque", icon: "book" },
  { key: "create", href: "/ajouter", icon: "plus-circle" },
  { key: "settings", href: "/parametres", icon: "settings" },
] as const;

/**
 * Navigation (V4) : Accueil, Bibliothèque, Créer, Paramètres. Barre basse sur mobile, rail
 * latéral sur ordinateur. Masquée seulement quand le clavier virtuel est réellement ouvert.
 */
function BottomNavigation() {
  const t = useT();
  const pathname = usePathname();
  const current = navSection(pathname);
  return (
    <nav className="bottomnav" aria-label={t.nav.main}>
      {NAV.map((n) => (
        <Link key={n.key} href={n.href} className="bottomnav-item" aria-current={current === n.key ? "page" : undefined}>
          <Icon name={n.icon} size={22} />
          <span>{t.v4.nav[n.key]}</span>
        </Link>
      ))}
    </nav>
  );
}

/**
 * Coquille de l'application connectée (V4) : en-tête (logo, cloche, avatar) et navigation
 * à quatre destinations. La lecture et l'aperçu d'une leçon les masquent (cf. v2.css).
 */
export function AppShell({ email }: { email: string }) {
  useKeyboardState();
  return (
    <>
      <AppHeader email={email} />
      <BottomNavigation />
    </>
  );
}
