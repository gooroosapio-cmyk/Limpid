import { getT } from "@/lib/i18n/server";
import { LoaderBook } from "@/components/LoaderBook";

/** Ouverture d'un rapport : le livre animé, puis la silhouette du texte. */
export default async function Loading() {
  const t = await getT();
  return (
    <div className="page page-loading" aria-busy="true">
      <span className="sr-only" role="status">{t.common.openingReport}</span>
      <LoaderBook />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line short" />
    </div>
  );
}
