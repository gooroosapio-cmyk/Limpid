import { getT } from "@/lib/i18n/server";
/** Chargement d'écran (kit V3) : silhouette du contenu, sans pourcentage. */
export default async function Loading() {
  const t = await getT();
  return (
    <div className="page page-loading" aria-busy="true">
      <span className="sr-only" role="status">{t.common.loading}</span>
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line short" />
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line short" />
    </div>
  );
}
