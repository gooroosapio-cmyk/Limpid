"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { fr } from "@/lib/i18n/fr";

/**
 * En-tête de 64 px : marque sur les racines, sinon retour et titre. Le retour suit l'historique
 * du navigateur quand on vient de l'application (même résultat que le geste système), sinon le lien parent.
 */
export function TopBar({ title, back, actions, root = false }: { title?: string; back?: string; actions?: React.ReactNode; root?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={scrolled ? "topbar scrolled" : "topbar"}>
      {root ? (
        <Link href="/" className="brand-link root-only" aria-label="Limpid, accueil">
          <span className="brand">
            <LogoMark />
            <b>limpid</b>
          </span>
        </Link>
      ) : back ? (
        <a
          href={back}
          className="ib"
          aria-label={fr.nav.back}
          onClick={(e) => {
            const fromApp = document.referrer.startsWith(window.location.origin) && window.history.length > 1;
            if (fromApp) {
              e.preventDefault();
              router.back();
            }
          }}
        >
          <Icon name="back" />
        </a>
      ) : null}
      {title && !root && <span className="topbar-title">{title}</span>}
      {actions && <div className="topbar-actions">{actions}</div>}
    </header>
  );
}
