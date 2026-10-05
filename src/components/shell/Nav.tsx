"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { fr } from "@/lib/i18n/fr";

const ROOTS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/", label: fr.nav.home, icon: "home", match: (p) => p === "/" },
  { href: "/bibliotheque", label: fr.nav.library, icon: "book", match: (p) => p.startsWith("/bibliotheque") || p.startsWith("/rapports") || p.startsWith("/sources") },
  { href: "/compte", label: fr.nav.account, icon: "user", match: (p) => p.startsWith("/compte") || p.startsWith("/admin") },
];

/** Racines où la navigation basse est visible (les écrans de détail ont leur propre barre). */
export const ROOT_PATHS = ["/", "/bibliotheque", "/compte"];

/** Rail compact (700–1199 px) puis barre latérale (≥ 1200 px). */
export function Rail({ email }: { email: string }) {
  const pathname = usePathname();
  const initials = email.slice(0, 2);
  return (
    <aside className="rail">
      <Link href="/" className="brand-link" aria-label="Limpid, accueil">
        <span className="brand">
          <LogoMark />
          <b>limpid</b>
        </span>
      </Link>
      <nav className="rail-nav" aria-label={fr.nav.main}>
        {ROOTS.map((r) => (
          <Link key={r.href} href={r.href} aria-current={r.match(pathname) ? "page" : undefined} title={r.label}>
            <Icon name={r.icon} />
            <span className="label">{r.label}</span>
            <span className="sr-only">{r.label}</span>
          </Link>
        ))}
      </nav>
      <Link href="/ajouter" className="rail-add" title={fr.nav.add}>
        <Icon name="plus" />
        <span className="label">{fr.nav.add}</span>
        <span className="sr-only">{fr.nav.add}</span>
      </Link>
      <div className="rail-foot">
        <Link href="/compte" className="who" aria-label={`${fr.nav.account} : ${email}`}>
          <span className="avatar" aria-hidden="true">{initials}</span>
          <span>{email}</span>
        </Link>
      </div>
    </aside>
  );
}

/** Navigation basse, sur les trois racines seulement. */
export function RootNav() {
  const pathname = usePathname();
  if (!ROOT_PATHS.includes(pathname)) return null;
  return (
    <nav className="rootnav" aria-label={fr.nav.main}>
      {ROOTS.map((r) => (
        <Link key={r.href} href={r.href} aria-current={r.match(pathname) ? "page" : undefined}>
          <Icon name={r.icon} />
          {r.label}
        </Link>
      ))}
    </nav>
  );
}
