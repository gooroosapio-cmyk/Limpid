"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";

interface MenuData {
  folders: { id: string; name: string }[];
  limpids: { id: string; title: string; state: "ready" | "running" | "failed"; favorite: boolean }[];
}

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

function Item({ href, icon, label, current, onNavigate }: { href: string; icon: IconName; label: string; current: boolean; onNavigate: () => void }) {
  return (
    <Link href={href} className="side-item" aria-current={current ? "page" : undefined} onClick={onNavigate}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </Link>
  );
}

/**
 * Menu latéral (remplace la barre basse) : Accueil, Sources, Dossiers (liste dépliante),
 * Créer un Limpid mis en évidence, Favoris, Bibliothèque (« Voir tout ») et la liste simple
 * des Limpid, qui défile si elle est longue. Paramètres en bas, fixe, dans un menu déroulant.
 * Ordinateur : toujours visible. Mobile : tiroir ouvert par le bouton de l'en-tête.
 */
export function SideMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const m = t.v4.menu;
  const pathname = usePathname();
  const search = useSearchParams();
  const isCurrent = useCurrent();
  const [data, setData] = useState<MenuData>({ folders: [], limpids: [] });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Dossiers et Limpid relus à chaque changement d'écran (création, suppression, renommage).
  useEffect(() => {
    let live = true;
    fetch("/api/menu", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MenuData | null) => live && d && setData(d))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [pathname]);

  // Tiroir mobile : Échap ferme, le focus entre dans le menu à l'ouverture.
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Menu Paramètres : se ferme au clic extérieur ou avec Échap.
  useEffect(() => {
    if (!settingsOpen) return;
    const away = (e: MouseEvent) => !settingsRef.current?.contains(e.target as Node) && setSettingsOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setSettingsOpen(false);
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key);
    };
  }, [settingsOpen]);

  const inFolder = pathname === "/bibliotheque" && !!search.get("dossier");
  const done = () => {
    setSettingsOpen(false);
    onClose();
  };

  return (
    <>
      {open && <button type="button" className="side-backdrop" aria-label={m.close} onClick={onClose} />}
      <nav ref={panel} id="side-menu" className={`side-menu${open ? " is-open" : ""}`} aria-label={m.label}>
        <div className="side-top">
          <Item href="/" icon="home" label={m.home} current={isCurrent("/")} onNavigate={done} />
          <Item href="/bibliotheque?vue=sources" icon="file" label={m.sources} current={isCurrent("/bibliotheque?vue=sources")} onNavigate={done} />
          <details className="side-folders" open={inFolder || undefined}>
            <summary className="side-item">
              <Icon name="folder" size={20} />
              <span>{m.folders}</span>
              <Icon name="chevron" size={18} className="side-caret" />
            </summary>
            <ul>
              {data.folders.length === 0 && <li className="side-empty">{m.noFolders}</li>}
              {data.folders.map((f) => (
                <li key={f.id}>
                  <Link href={`/bibliotheque?dossier=${f.id}`} className="side-sub" aria-current={isCurrent(`/bibliotheque?dossier=${f.id}`) ? "page" : undefined} onClick={done}>
                    {f.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/bibliotheque?nouveau-dossier=1" className="side-sub side-add" onClick={done}>
                  <Icon name="folder-plus" size={16} /> {m.newFolder}
                </Link>
              </li>
            </ul>
          </details>
          <Link href="/" className="side-create" onClick={done}>
            <Icon name="plus" size={20} /> {m.create}
          </Link>
          <Item href="/bibliotheque?filtre=favoris" icon="heart" label={m.favorites} current={isCurrent("/bibliotheque?filtre=favoris")} onNavigate={done} />
          <div className="side-library-head">
            <Link href="/bibliotheque" className="side-item side-library" aria-current={isCurrent("/bibliotheque") ? "page" : undefined} onClick={done}>
              <Icon name="book" size={20} />
              <span>{m.library}</span>
            </Link>
            <Link href="/bibliotheque" className="side-seeall" onClick={done}>{m.seeAll}</Link>
          </div>
        </div>

        <ul className="side-limpids">
          {data.limpids.length === 0 && <li className="side-empty">{m.empty}</li>}
          {data.limpids.map((l) => {
            const href = l.state === "ready" ? `/rapports/${l.id}/apercu` : `/rapports/${l.id}`;
            const current = pathname.startsWith(`/rapports/${l.id}`);
            return (
              <li key={l.id}>
                <Link href={href} className={`side-limpid side-limpid-${l.state}`} aria-current={current ? "page" : undefined} onClick={done} title={l.title}>
                  <span className="side-limpid-title">{l.title}</span>
                  {l.state === "failed" && <small className="side-badge is-failed">{m.failed}</small>}
                  {l.state === "running" && <small className="side-badge">{m.preparing}</small>}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="side-bottom" ref={settingsRef}>
          {settingsOpen && (
            <ul className="side-settings-menu" id="side-settings">
              <li><Link href="/parametres" onClick={done}><Icon name="settings" size={18} /> {m.settings}</Link></li>
              <li><Link href="/compte" onClick={done}><Icon name="user" size={18} /> {m.profile}</Link></li>
              <li><Link href="/offres" onClick={done}><Icon name="star" size={18} /> {m.offers}</Link></li>
              <li><Link href="/bienvenue/tutoriel" onClick={done}><Icon name="bulb" size={18} /> {m.help}</Link></li>
              <li>
                <form action="/auth/deconnexion" method="post">
                  <button type="submit"><Icon name="logout" size={18} /> {m.logout}</button>
                </form>
              </li>
            </ul>
          )}
          <button
            type="button"
            className="side-item side-settings"
            aria-expanded={settingsOpen}
            aria-controls="side-settings"
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <Icon name="settings" size={20} />
            <span>{m.settings}</span>
            <Icon name="chevron" size={18} className="side-caret" />
          </button>
        </div>
      </nav>
    </>
  );
}
