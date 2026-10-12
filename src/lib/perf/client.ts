/**
 * Mesures navigateur (prompt « Fluidité », § 1) : Web Vitals, navigation interne et temps
 * d'actions clés. Envoi groupé et discret (sendBeacon) ; aucune donnée de contenu, l'adresse
 * est réduite à son modèle (/rapports/:id).
 */

export interface ClientMetric {
  name: string;
  value_ms: number;
  route: string | null;
  device: "mobile" | "tablet" | "desktop";
  network: string | null;
  trace_id?: string | null;
  ok?: boolean;
}

const queue: ClientMetric[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let navStart: { at: number; path: string } | null = null;

/** /rapports/3f2…/pdf → /rapports/:id/pdf ; paramètres retirés. */
export function routeTemplate(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? "/";
  return clean
    .split("/")
    .map((seg) => (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(seg) || /^\d+$/.test(seg) || seg.length > 32 ? ":id" : seg))
    .join("/")
    .slice(0, 80);
}

function device(): ClientMetric["device"] {
  const w = Math.min(window.screen?.width ?? window.innerWidth, window.innerWidth);
  return w < 600 ? "mobile" : w < 1024 ? "tablet" : "desktop";
}

function network(): string | null {
  const c = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  return c?.effectiveType?.slice(0, 12) ?? null;
}

function flush() {
  timer = null;
  if (!queue.length) return;
  const body = JSON.stringify({ metrics: queue.splice(0, 20) });
  const sent = typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/metrics", new Blob([body], { type: "application/json" }));
  if (!sent) void fetch("/api/metrics", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
  if (queue.length) schedule();
}

function schedule() {
  if (!timer) timer = setTimeout(flush, 10_000);
}

if (typeof window !== "undefined") {
  // Dernier envoi quand la page passe en arrière-plan (fermeture, changement d'application).
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

export function reportMetric(name: string, valueMs: number, extra: { ok?: boolean; traceId?: string | null; route?: string } = {}) {
  if (typeof window === "undefined" || !Number.isFinite(valueMs) || valueMs < 0) return;
  queue.push({
    name,
    value_ms: Math.round(valueMs),
    route: routeTemplate(extra.route ?? location.pathname),
    device: device(),
    network: network(),
    trace_id: extra.traceId ?? null,
    ok: extra.ok ?? true,
  });
  if (queue.length >= 20) flush();
  else schedule();
}

/** Début d'une navigation interne (instrumentation-client). */
export function markNavigationStart(url: string) {
  navStart = { at: performance.now(), path: url };
}

/** Fin : la nouvelle page est rendue (premier rafraîchissement d'écran après le changement d'adresse). */
export function markNavigationEnd(pathname: string) {
  const start = navStart;
  if (!start) return;
  navStart = null;
  requestAnimationFrame(() => reportMetric("nav.internal", performance.now() - start.at, { route: pathname }));
}

/** Identifiant de corrélation client ↔ serveur (aléatoire, sans lien avec le compte). */
export function newTraceId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}
