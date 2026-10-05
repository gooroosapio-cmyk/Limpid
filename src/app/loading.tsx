/** Chargement d'écran (kit V3) : silhouette du contenu, sans pourcentage. */
export default function Loading() {
  return (
    <div className="page page-loading" aria-busy="true">
      <span className="sr-only" role="status">Chargement…</span>
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
