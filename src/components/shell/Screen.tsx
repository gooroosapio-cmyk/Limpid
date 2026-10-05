/** Écran standard : contenu centré sous la barre d'en-tête de l'application, entrée animée. */
export function Screen({
  wide = false,
  fab = false,
  className,
  children,
}: {
  wide?: boolean;
  /** Réserve la place du bouton flottant en bas d'écran. */
  fab?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const cls = ["page", "page-enter", wide ? "page-wide" : "", fab ? "with-fab" : "", className ?? ""].filter(Boolean).join(" ");
  return <div className={cls}>{children}</div>;
}
