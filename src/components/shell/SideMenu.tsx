"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { Wordmark } from "@/components/Logo";
import { Cover } from "@/components/library/Cover";
import { ActionMenu } from "@/components/shell/ActionMenu";
import { useT } from "@/lib/i18n/client";
import { initials } from "@/lib/initials";
import type { CoverView } from "@/lib/library/covers";

interface MenuData {
  name: string | null;
  email: string | null;
  credits: number | null;
  admin: boolean;
  folders: { id: string; name: string; count: number }[];
  recent: { id: string; title: string; state: "ready" | "running" | "failed"; cover: CoverView }[];
}

const EMPTY: MenuData = { name: null, email: null, credits: null, admin: false, folders: [], recent: [] };
/** Dernier contenu connu : le menu s'affiche aussitôt, puis s'actualise discrètement. */
let cache: MenuData | null = null;

/** Lien actif : même chemin et mêmes paramètres significatifs (vue, filtre, dossier). */
function useCurrent() {
  const pathname = usePathname();
  const search = useSearchParams();
  return (href: string) => {
    const url = new URL(href, "http://x");
    if (url.pathname !== pathname) return false;
    for (const k of ["vue", "filtre", "dossier"]) if ((url.searchParams.get(k) ?? "") !== (search.get(k) ?? "")) return false;
    return true;
  };
}

function Item({ href, icon, label, current, onNavigate, badge }: { href: string; icon: IconName; label: string; current: boolean; onNavigate: () => void; badge?: string }) {
  return (
    <Link href={href} className="nd-item" aria-current={current ? "page" : undefined} onClick={onNavigate}>
      <Icon name={icon} size={22} />
      <span>{label}</span>
      {badge ? <small className="nd-badge">{badge}</small> : <span />}
    </Link>
  );
}

/**
 * Menu latéral (prompt « Fluidité », § 8, planche 02) : logo et fermeture ; compte et solde
 * réels ; « Créer un Limpid » ; navigation ; dossiers repliables ; deux ou trois récents ;
 * paramètres, aide et administration (compte autorisé seulement). Tiroir sur mobile
 * (min(88vw, 360px), focus piégé, rendu au bouton d'ouverture), toujours visible sur ordinateur.
 */
export function SideMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const m = t.v4.menu;
  const n = t.fluid.nav;
  const pathname = usePathname();
  const search = useSearchParams();
  const isCurrent = useCurrent();
  const router = useRouter();
  const [data, setData] = useState<MenuData>(cache ?? EMPTY);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/menu", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MenuData | null) => {
        if (!live || !d) return;
        cache = d;
        setData(d);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [pathname]);

  // Tiroir mobile : focus dans le menu, piégé ; Échap ferme et rend le focus au bouton.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>(".nd-close")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab" || !panel.current) return;
      const f = [...panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), summary")].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0]!;
      const last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [open, onClose]);

  const folder = pathname === "/bibliotheque" ? search.get("dossier") : null;
  const done = () => onClose();

  return (
    <>
      {open && <button type="button" className="side-backdrop" aria-label={m.close} tabIndex={-1} onClick={onClose} />}
      <nav ref={panel} id="side-menu" className={`side-menu nd${open ? " is-open" : ""}`} aria-label={m.label}>
        <div className="nd-head">
          <Link href="/" className="nd-logo" aria-label={t.common.brandHome} onClick={done}><Wordmark height={28} /></Link>
          <button type="button" className="icon-button nd-close" aria-label={m.close} onClick={onClose}><Icon name="close" size={22} /></button>
        </div>

        <div className="nd-scroll">
          <Link href="/compte" className="nd-account" onClick={done} aria-current={pathname === "/compte" ? "page" : undefined}>
            <span className="avatar nd-avatar" aria-hidden="true">{initials(data.name, data.email ?? "")}</span>
            <span className="nd-account-text">
              <b>{n.account}</b>
              <small>{data.credits === null ? n.creditsUnknown : n.credits(data.credits)}</small>
            </span>
            <Icon name="chevron" size={18} />
          </Link>

          <Link href="/" className="nd-create" onClick={done}><Icon name="plus" size={20} /> {m.create}</Link>

          <p className="nd-section" id="nd-nav">{n.navigation}</p>
          <ul className="nd-list" aria-labelledby="nd-nav">
            <li><Item href="/" icon="home" label={m.home} current={isCurrent("/")} onNavigate={done} /></li>
            <li><Item href="/bibliotheque" icon="book" label={m.library} current={isCurrent("/bibliotheque")} onNavigate={done} /></li>
            <li><Item href="/bibliotheque?vue=sources" icon="file" label={m.sources} current={isCurrent("/bibliotheque?vue=sources")} onNavigate={done} /></li>
            <li><Item href="/bibliotheque?filtre=favoris" icon="heart" label={m.favorites} current={isCurrent("/bibliotheque?filtre=favoris")} onNavigate={done} /></li>
            <li>
              <details className="nd-folders" open={!!folder || undefined}>
                <summary className="nd-item">
                  <Icon name="folder" size={22} />
                  <span>{m.folders}</span>
                  <Icon name="chevron" size={18} className="nd-caret" />
                </summary>
                <ul>
                  {data.folders.length === 0 && <li className="nd-empty">{m.noFolders}</li>}
                  {data.folders.map((f) => (
                    <li key={f.id}>
                      <Link href={`/bibliotheque?dossier=${f.id}`} className="nd-sub" aria-current={folder === f.id ? "page" : undefined} onClick={done}>
                        <Icon name="folder" size={18} /> <span>{f.name}</span> <small>· {f.count}</small>
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link href="/bibliotheque?nouveau-dossier=1" className="nd-sub nd-add" onClick={done}>
                      <Icon name="folder-plus" size={18} /> <span>{m.newFolder}</span>
                    </Link>
                  </li>
                </ul>
              </details>
            </li>
          </ul>

          {data.recent.length > 0 && (
            <>
              <div className="nd-section-row">
                <p className="nd-section" id="nd-recent">{n.recent}</p>
                <Link href="/bibliotheque" className="nd-seeall" onClick={done}>{m.seeAll} <Icon name="chevron" size={14} /></Link>
              </div>
              <ul className="nd-recent" aria-labelledby="nd-recent">
                {data.recent.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={r.state === "ready" ? `/rapports/${r.id}/apercu` : `/rapports/${r.id}`}
                      className="nd-recent-link"
                      aria-current={pathname.startsWith(`/rapports/${r.id}`) ? "page" : undefined}
                      onClick={done}
                    >
                      <Cover cover={r.cover} className="nd-thumb" />
                      <span className="nd-recent-text">
                        <b>{r.title}</b>
                        <small className={r.state === "failed" ? "is-failed" : undefined}>{r.state === "ready" ? n.ready : r.state === "running" ? n.running : n.toResume}</small>
                      </span>
                    </Link>
                    <ActionMenu
                      label={t.library.actionsFor(r.title)}
                      items={[
                        { label: n.open, icon: "book", onSelect: () => { done(); router.push(`/rapports/${r.id}`); } },
                        { label: n.inLibrary, icon: "library", onSelect: () => { done(); router.push("/bibliotheque"); } },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}

          <ul className="nd-list nd-bottom">
            <li><Item href="/parametres" icon="settings" label={m.settings} current={isCurrent("/parametres")} onNavigate={done} /></li>
            <li><Item href="/bienvenue/tutoriel" icon="info" label={n.help} current={isCurrent("/bienvenue/tutoriel")} onNavigate={done} /></li>
            {data.admin && <li><Item href="/admin" icon="bars" label={n.admin} current={pathname.startsWith("/admin")} onNavigate={done} badge={n.adminBadge} /></li>}
            <li>
              <form action="/auth/deconnexion" method="post">
                <button type="submit" className="nd-item"><Icon name="logout" size={22} /> <span>{m.logout}</span><span /></button>
              </form>
            </li>
          </ul>
          <p className="nd-foot">{n.poweredBy}</p>
        </div>
      </nav>
    </>
  );
}
