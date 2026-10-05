import type { CoverView } from "@/lib/library/covers";

/** Couverture décorative (aria-hidden) : image de la banque si livrée, sinon dégradé de la même famille. */
export function Cover({ cover, className, eager = false }: { cover: CoverView; className?: string; eager?: boolean }) {
  return (
    <div className={`cover cover-${cover.id}${className ? ` ${className}` : ""}`} aria-hidden="true">
      {/* Fichier statique déjà dimensionné (WebP de la banque) : pas d'optimiseur d'images. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {cover.image && <img src={cover.image} alt="" loading={eager ? "eager" : "lazy"} decoding="async" />}
    </div>
  );
}
