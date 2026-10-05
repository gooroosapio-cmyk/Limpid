import { Cover } from "@/components/library/Cover";
import { coverView, type CoverId } from "@/lib/library/covers";

/** Illustrations décoratives d'écran (public/illustrations/<nom>.webp), à activer une fois livrées. */
export const ILLUSTRATIONS = [
  "connexion",
  "bibliotheque-vide",
  "import",
  "offres",
  "offres-actuelle",
  "offres-plus",
  "profil-offre",
  "lecon-presentation",
  "lecon-quiz",
] as const;
export type IllustrationName = (typeof ILLUSTRATIONS)[number];
const READY: ReadonlySet<IllustrationName> = new Set<IllustrationName>([]);

/** Image livrée, sinon le dégradé d'une couverture de la banque (aucune requête vers un fichier absent). */
export function Illustration({ name, fallback, className, eager = false }: { name: IllustrationName; fallback: CoverId; className?: string; eager?: boolean }) {
  if (!READY.has(name)) return <Cover cover={coverView(fallback)} className={className} eager={eager} />;
  return (
    <div className={`cover${className ? ` ${className}` : ""}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- fichier statique déjà dimensionné */}
      <img src={`/illustrations/${name}.webp`} alt="" loading={eager ? "eager" : "lazy"} decoding="async" />
    </div>
  );
}
