"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Logo";
import { useT } from "@/lib/i18n/client";
import { initials } from "@/lib/initials";

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

/** Barre basse flottante (BottomNavigation) : Bibliothèque, Créer (import), Paramètres. */
function BottomNavigation() {
  const t = useT();
  const pathname = usePathname();
  const atLibrary = pathname === "/" || pathname.startsWith("/preparations") || pathname.startsWith("/sources");
  const atCreate = pathname.startsWith("/ajouter");
  const atSettings = ["/parametres", "/compte", "/offres", "/paiement", "/admin", "/a-propos", "/notifications"].some((p) => pathname.startsWith(p));
  return (
    <nav className="bottomnav" aria-label={t.nav.main}>
      <Link href="/" className="bottomnav-item" aria-current={atLibrary ? "page" : undefined}>
        <Icon name="book" size={26} />
        <span>{t.nav.library}</span>
      </Link>
      <Link href="/ajouter" className="bottomnav-item" aria-current={atCreate ? "page" : undefined}>
        <Icon name="plus-circle" size={26} />
        <span>{t.shell.createLabel}</span>
      </Link>
      <Link href="/parametres" className="bottomnav-item" aria-current={atSettings ? "page" : undefined}>
        <Icon name="settings" size={26} />
        <span>{t.nav.settings}</span>
      </Link>
    </nav>
  );
}

/**
 * Coquille de l'application connectée (V2.1) : en-tête (logo, cloche, avatar) et barre basse
 * à trois destinations. La lecture et l'aperçu d'une leçon les masquent (cf. v2.css).
 */
export function AppShell({ email }: { email: string }) {
  return (
    <>
      <AppHeader email={email} />
      <BottomNavigation />
    </>
  );
}
