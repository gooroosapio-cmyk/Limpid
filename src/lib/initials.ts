/** Initiales d'un nom affiché (« Awa Diallo » → « AD »), sinon de l'adresse (« awa.diallo@… » → « AD »). */
export function initials(name: string | null | undefined, email: string): string {
  const source = name?.trim() ? name.trim().split(/\s+/) : (email.split("@")[0] ?? "").split(/[._-]+/);
  const parts = source.filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? (name?.trim() ? "" : (parts[0]?.[1] ?? "")))).toUpperCase() || "?";
}
