import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { OfflineList } from "@/components/OfflineList";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.pwa.offlineTitle };
}

/** Hors connexion (kit V3, écran 42) : page mise en cache par le service worker, sans donnée de compte. */
export default async function OfflinePage() {
  const t = await getT();
  return (
    <div className="page page-enter">
      <div className="offline-art" aria-hidden="true"><Icon name="cloud" /></div>
      <h1>{t.pwa.offlineHeading}</h1>
      <p className="lede">{t.pwa.offlineLede}</p>
      <h2 className="eyebrow">{t.pwa.saved}</h2>
      <OfflineList />
      <a href="/" className="btn btn-block">{t.pwa.retry}</a>
    </div>
  );
}
