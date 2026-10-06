/** Destination active de la barre basse : une route hors des quatre n'en sélectionne aucune. */
export function navSection(pathname: string): "home" | "library" | "create" | "settings" | null {
  if (pathname === "/") return "home";
  if (["/bibliotheque", "/preparations", "/sources"].some((p) => pathname.startsWith(p))) return "library";
  if (pathname.startsWith("/ajouter")) return "create";
  if (["/parametres", "/compte", "/offres", "/paiement", "/admin", "/a-propos", "/preferences"].some((p) => pathname.startsWith(p))) return "settings";
  return null;
}
