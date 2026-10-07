import { ParallaxImg } from "@/components/motion/ParallaxImg";
import type { CoverView } from "@/lib/library/covers";

/**
 * Couverture décorative (aria-hidden) : image de la banque si livrée, sinon dégradé de la même
 * famille. `parallax` : légère parallaxe au défilement (grandes couvertures seulement).
 */
export function Cover({ cover, className, eager = false, parallax = false }: { cover: CoverView; className?: string; eager?: boolean; parallax?: boolean }) {
  return (
    <div className={`cover cover-${cover.id}${className ? ` ${className}` : ""}`} aria-hidden="true">
      {/* Fichier statique déjà dimensionné (WebP de la banque) : pas d'optimiseur d'images. */}
      {cover.image &&
        (parallax ? (
          <ParallaxImg src={cover.image} eager={eager} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.image} alt="" loading={eager ? "eager" : "lazy"} decoding="async" />
        ))}
    </div>
  );
}
