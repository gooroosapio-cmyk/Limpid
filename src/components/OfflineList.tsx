"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { fr } from "@/lib/i18n/fr";
import type { SavedReport } from "@/lib/offline";

/** Liste des rapports enregistrés sur l'appareil (lue dans les caches, sans réseau). */
export function OfflineList() {
  const [items, setItems] = useState<SavedReport[] | null>(null);
  useEffect(() => {
    (async () => {
      if (!("caches" in window)) return setItems([]);
      const keys = (await caches.keys()).filter((k) => k.startsWith("limpid-offline-"));
      const all: SavedReport[] = [];
      for (const k of keys) {
        const res = await (await caches.open(k)).match("/__limpid-offline-index");
        if (res) all.push(...((await res.json()) as SavedReport[]));
      }
      setItems(all);
    })().catch(() => setItems([]));
  }, []);
  if (items === null) return <div className="skeleton skeleton-row" aria-hidden="true" />;
  if (items.length === 0) return <p className="muted">{fr.pwa.none}</p>;
  return (
    <ul className="rows stagger">
      {items.map((r) => (
        <li key={r.url}>
          {/* Lien classique : la page vient du cache de l'appareil. */}
          <a href={r.url} className="row">
            <span className="row-icon"><Icon name="book" /></span>
            <span className="row-text"><b>{r.title}</b><small>{new Date(r.savedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</small></span>
            <Icon name="chevron" className="row-chevron" />
          </a>
        </li>
      ))}
    </ul>
  );
}
