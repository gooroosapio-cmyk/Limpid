import type { Dict } from "./index";

/**
 * Message d'erreur d'une API pour l'interface : traduction par code quand la langue en
 * propose une, sinon le message précis du serveur, sinon le repli fourni.
 */
export function apiMessage(t: Dict, body: unknown, fallback: string): string {
  const b = (body ?? {}) as { error?: unknown; message?: unknown };
  if (typeof b.error === "string" && t.apiErrors[b.error]) return t.apiErrors[b.error]!;
  return typeof b.message === "string" && b.message ? b.message : fallback;
}
