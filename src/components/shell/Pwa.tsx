"use client";

import { useEffect, useState } from "react";
import { fr } from "@/lib/i18n/fr";
import { purgeOtherAccounts } from "@/lib/offline";

declare global {
  interface Window {
    __limpidInstall?: Event & { prompt: () => Promise<void> };
  }
}

/**
 * Service worker, bandeau de connexion et mise à jour. `account` : clé du compte connecté
 * (null = déconnecté : les rapports enregistrés sur l'appareil sont effacés).
 */
export function Pwa({ account }: { account: string | null }) {
  const [offline, setOffline] = useState(false);
  const [back, setBack] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    void purgeOtherAccounts(account).catch(() => undefined);
  }, [account]);

  useEffect(() => {
    const onInstall = (e: Event) => {
      e.preventDefault();
      window.__limpidInstall = e as Window["__limpidInstall"];
      window.dispatchEvent(new Event("limpid-installable"));
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    const update = () => setOffline(!navigator.onLine);
    const goOnline = () => {
      update();
      setBack(true);
      setTimeout(() => setBack(false), 2500);
    };
    update();
    window.addEventListener("offline", update);
    window.addEventListener("online", goOnline);

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
          reg.addEventListener("updatefound", () => {
            const w = reg.installing;
            w?.addEventListener("statechange", () => {
              if (w.state === "installed" && navigator.serviceWorker.controller) setWaiting(w);
            });
          });
        })
        .catch(() => undefined);
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener("offline", update);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (offline) return <p className="connectivity" role="status">{fr.pwa.offline}</p>;
  if (waiting)
    return (
      <div className="connectivity" role="status">
        <span>{fr.pwa.update}</span>
        <button type="button" className="btn btn-primary" onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })}>{fr.pwa.reload}</button>
      </div>
    );
  if (back) return <p className="connectivity" role="status">{fr.pwa.online}</p>;
  return null;
}
