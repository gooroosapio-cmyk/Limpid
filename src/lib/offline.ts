/**
 * Rapports enregistrés hors connexion (côté navigateur). Un cache par compte : changer de
 * compte ou se déconnecter efface les rapports des autres comptes sur cet appareil.
 */
const PREFIX = "limpid-offline-";
const INDEX = "/__limpid-offline-index";

export interface SavedReport {
  url: string;
  title: string;
  savedAt: string;
}

export function offlineSupported(): boolean {
  return typeof window !== "undefined" && "caches" in window && "serviceWorker" in navigator;
}

function cacheName(account: string): string {
  return `${PREFIX}${account}`;
}

/** Supprime les caches hors connexion qui n'appartiennent pas à `account` (null : tous). */
export async function purgeOtherAccounts(account: string | null): Promise<void> {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && (account === null || k !== cacheName(account))).map((k) => caches.delete(k)));
}

export async function listSaved(account: string): Promise<SavedReport[]> {
  const c = await caches.open(cacheName(account));
  const res = await c.match(INDEX);
  return res ? ((await res.json()) as SavedReport[]) : [];
}

async function writeIndex(account: string, list: SavedReport[]) {
  const c = await caches.open(cacheName(account));
  await c.put(INDEX, new Response(JSON.stringify(list), { headers: { "Content-Type": "application/json" } }));
}

/** Enregistre la page du rapport et les fichiers statiques déjà chargés (styles, scripts, polices). */
export async function saveReport(account: string, path: string, title: string): Promise<void> {
  const c = await caches.open(cacheName(account));
  const res = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  await c.put(new URL(path, location.origin).href, res);
  const assets = performance
    .getEntriesByType("resource")
    .map((e) => new URL(e.name))
    .filter((u) => u.origin === location.origin && /^\/(_next\/static|fonts|icons)\//.test(u.pathname))
    .map((u) => u.href);
  const statics = await caches.open("limpid-static");
  await Promise.all([...new Set(assets)].map(async (a) => ((await statics.match(a)) ? undefined : statics.add(a).catch(() => undefined))));
  const list = (await listSaved(account)).filter((r) => r.url !== path);
  await writeIndex(account, [{ url: path, title, savedAt: new Date().toISOString() }, ...list].slice(0, 50));
}

export async function removeSaved(account: string, path: string): Promise<void> {
  const c = await caches.open(cacheName(account));
  await c.delete(new URL(path, location.origin).href);
  await writeIndex(account, (await listSaved(account)).filter((r) => r.url !== path));
}

export async function isSaved(account: string, path: string): Promise<boolean> {
  return (await listSaved(account)).some((r) => r.url === path);
}
