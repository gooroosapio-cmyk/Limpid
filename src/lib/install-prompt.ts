/**
 * Invitation à installer Limpid (web) : dès la première ouverture ; après un refus, de nouveau
 * à la 3e visite, puis toutes les 2 visites (5e, 7e…). Jamais une fois l'application installée.
 * Une visite = une ouverture de l'application (nouvelle session du navigateur).
 */
export interface InstallState {
  visits: number;
  /** Visite du dernier refus (0 : jamais refusé). */
  dismissedAt: number;
  installed: boolean;
}

export const EMPTY_INSTALL: InstallState = { visits: 0, dismissedAt: 0, installed: false };

export function shouldAskInstall(s: InstallState): boolean {
  if (s.installed || s.visits < 1) return false;
  if (s.dismissedAt === 0) return true;
  if (s.visits <= s.dismissedAt) return false;
  return s.visits >= 3 && (s.visits - 3) % 2 === 0;
}

export function parseInstallState(raw: string | null): InstallState {
  try {
    const v = JSON.parse(raw ?? "null") as Partial<InstallState> | null;
    if (!v || typeof v !== "object") return EMPTY_INSTALL;
    const n = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x >= 0 && x < 1e6 ? x : 0);
    return { visits: n(v.visits), dismissedAt: n(v.dismissedAt), installed: v.installed === true };
  } catch {
    return EMPTY_INSTALL;
  }
}
