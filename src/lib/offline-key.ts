import "server-only";
import { createHash } from "node:crypto";

/** Clé de cache hors connexion d'un compte (empreinte, jamais l'identifiant en clair). */
export function offlineKey(userId: string): string {
  return createHash("sha256").update(`limpid-offline:${userId}`).digest("hex").slice(0, 16);
}
