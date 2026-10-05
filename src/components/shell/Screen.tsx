import { getT } from "@/lib/i18n/server";

/** Écran standard : contenu centré sous la barre d'en-tête de l'application, entrée animée. */
export async function Screen({
  wide = false,
  fab = false,
  footer = true,
  className,
  children,
}: {
  wide?: boolean;
  /** Réserve la place du bouton flottant en bas d'écran. */
  fab?: boolean;
  /** Pied de page « Propulsé par gooroo » (jamais dans le lecteur). */
  footer?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const cls = ["page", "page-enter", wide ? "page-wide" : "", fab ? "with-fab" : "", className ?? ""].filter(Boolean).join(" ");
  const t = footer ? await getT() : null;
  return (
    <div className={cls}>
      {children}
      {t && <footer className="app-foot"><p className="powered">{t.brand.poweredBy}</p></footer>}
    </div>
  );
}
