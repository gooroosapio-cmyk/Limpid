/*
 * Service worker Limpid (kit V3, écrans 41-42).
 * - Fichiers statiques versionnés (/_next/static, polices, icônes) : cache d'abord.
 * - Pages : réseau d'abord ; hors connexion, rapport enregistré sur cet appareil
 *   (cache « limpid-offline-<compte> », rempli à la demande depuis la page) ou écran « Hors connexion ».
 * - Aucune requête API mise en cache ; aucun envoi différé au retour du réseau.
 */
const VERSION = "v3-2026-10-05";
const SHELL = `limpid-shell-${VERSION}`;
const STATIC = "limpid-static";
const OFFLINE_PAGE = "/hors-ligne";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll([new Request(OFFLINE_PAGE, { credentials: "omit" }), "/icons/limpid-192.png"]))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("limpid-shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isStatic(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/icons/");
}

async function fromOffline(request) {
  const url = new URL(request.url);
  const keys = (await caches.keys()).filter((k) => k.startsWith("limpid-offline-"));
  for (const k of keys) {
    const hit = await (await caches.open(k)).match(url.origin + url.pathname, { ignoreSearch: true });
    if (hit) return hit;
  }
  return null;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC).then(async (c) => {
        const hit = await c.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) c.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (await fromOffline(request)) || (await caches.match(OFFLINE_PAGE)) || Response.error()),
    );
  }
});
