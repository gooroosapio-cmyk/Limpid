import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { OfflineList } from "@/components/OfflineList";
import { fr } from "@/lib/i18n/fr";

export const metadata: Metadata = { title: fr.pwa.offlineTitle };

/** Hors connexion (kit V3, écran 42) : page mise en cache par le service worker, sans donnée de compte. */
export default function OfflinePage() {
  return (
    <div className="page page-enter">
      <div className="offline-art" aria-hidden="true"><Icon name="cloud" /></div>
      <h1>{fr.pwa.offlineHeading}</h1>
      <p className="lede">{fr.pwa.offlineLede}</p>
      <h2 className="eyebrow">{fr.pwa.saved}</h2>
      <OfflineList />
      <a href="/" className="btn btn-block">{fr.pwa.retry}</a>
    </div>
  );
}
