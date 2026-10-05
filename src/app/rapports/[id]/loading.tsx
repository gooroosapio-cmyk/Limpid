import { LoaderBook } from "@/components/LoaderBook";

/** Ouverture d'un rapport : le livre animé, puis la silhouette du texte. */
export default function Loading() {
  return (
    <div className="page page-loading" aria-busy="true">
      <span className="sr-only" role="status">Ouverture du rapport…</span>
      <LoaderBook />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line short" />
    </div>
  );
}
