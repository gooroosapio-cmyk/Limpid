"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { fr } from "@/lib/i18n/fr";

const items = [
  { href: "/", label: fr.nav.create, icon: "M12 5v14M5 12h14" },
  { href: "/rapports", label: fr.nav.reports, icon: "M7 4h10v16H7zM9.5 8h5M9.5 12h5M9.5 16h3" },
  { href: "/preferences", label: fr.nav.preferences, icon: "M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4" },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav className="desktop-nav" aria-label="Navigation principale">
      {items.map((it) => (
        <Link key={it.href} href={it.href} aria-current={isActive(pathname, it.href) ? "page" : undefined}>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      {items.map((it) => (
        <Link key={it.href} href={it.href} aria-current={isActive(pathname, it.href) ? "page" : undefined}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d={it.icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
