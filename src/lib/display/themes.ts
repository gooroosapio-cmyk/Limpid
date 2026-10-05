import type { ThemeId } from "@/lib/contracts/schemas";

/**
 * Thème choisi automatiquement selon l'organisation du rapport (kit V3 : « la longueur et le
 * thème de présentation sont choisis automatiquement »). Le lecteur peut ensuite en changer
 * sans aucun appel IA.
 */
export function autoTheme(templateId: string | null | undefined): ThemeId {
  switch (templateId) {
    case "comprendre_processus":
      return "guide";
    case "comparer_options":
    case "expliquer_document":
      return "dossier";
    default:
      return "sciences";
  }
}

/** Les thèmes sobres n'affichent pas d'image décorative (les schémas restent). */
export function showsIllustrations(theme: ThemeId): boolean {
  return theme !== "dossier";
}
