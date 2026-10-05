/** Heure courante pour un composant serveur : rendu à la requête, jamais mis en cache. */
export function nowMs(): number {
  return Date.now();
}
