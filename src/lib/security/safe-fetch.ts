/**
 * Téléchargement d'une URL publique avec protection SSRF (payload 1, § 6).
 *
 * - HTTP(S) uniquement, sans identifiants, ports 80/443 uniquement.
 * - Résolution DNS contrôlée : toutes les adresses doivent être publiques, et la
 *   connexion se fait sur l'adresse validée (lookup épinglé) : pas de rebinding.
 * - Chaque redirection est revalidée ; nombre, taille et délais bornés.
 * - Aucun cookie, aucun en-tête d'authentification n'est envoyé.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";
import { isPublicIP } from "./ip";

export class UrlRejected extends Error {
  constructor(
    public readonly code:
      | "invalid_url"
      | "scheme"
      | "credentials"
      | "port"
      | "private_address"
      | "dns_failure"
      | "too_many_redirects"
      | "too_large"
      | "timeout"
      | "http_status"
      | "content_type",
    message: string,
  ) {
    super(message);
  }
}

export interface SafeFetchOptions {
  maxBytes: number;
  timeoutMs: number;
  maxRedirects: number;
  allowedContentTypes: string[];
  /** Agent annoncé (certains services exigent un contact). */
  userAgent?: string;
  /** Pour les tests : remplace la résolution DNS. */
  resolver?: (host: string) => Promise<{ address: string; family: number }[]>;
}

export interface SafeFetchResult {
  finalUrl: string;
  contentType: string;
  /** Jeu de caractères annoncé par l'en-tête Content-Type, s'il y en a un. */
  charset: string | null;
  body: Buffer;
}

/** Validation statique d'une URL saisie par l'utilisateur (avant toute résolution). */
export function parsePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UrlRejected("invalid_url", "Adresse invalide.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlRejected("scheme", "Seules les adresses http et https sont acceptées.");
  }
  if (url.username || url.password) {
    throw new UrlRejected("credentials", "Les adresses contenant des identifiants sont refusées.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new UrlRejected("port", "Port non autorisé.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicIP(host)) {
    throw new UrlRejected("private_address", "Cette adresse n'est pas publique.");
  }
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local") || lower.endsWith(".internal")) {
    throw new UrlRejected("private_address", "Cette adresse n'est pas publique.");
  }
  return url;
}

async function resolvePublic(
  host: string,
  resolver: NonNullable<SafeFetchOptions["resolver"]>,
): Promise<{ address: string; family: number }> {
  const bare = host.replace(/^\[|\]$/g, "");
  if (isIP(bare)) {
    if (!isPublicIP(bare)) throw new UrlRejected("private_address", "Cette adresse n'est pas publique.");
    return { address: bare, family: isIP(bare) };
  }
  let addrs: { address: string; family: number }[];
  try {
    addrs = await resolver(bare);
  } catch {
    throw new UrlRejected("dns_failure", "Le site est introuvable.");
  }
  if (addrs.length === 0) throw new UrlRejected("dns_failure", "Le site est introuvable.");
  // Toutes les adresses doivent être publiques : un nom qui mélange public et privé est refusé.
  if (addrs.some((a) => !isPublicIP(a.address))) {
    throw new UrlRejected("private_address", "Cette adresse mène à un réseau privé.");
  }
  return addrs[0]!;
}

const defaultResolver = (host: string) => dnsLookup(host, { all: true, verbatim: true });

function requestOnce(
  url: URL,
  pinned: { address: string; family: number },
  opts: SafeFetchOptions,
): Promise<{ status: number; location?: string; contentType: string; charset: string | null; body: Buffer }> {
  return new Promise((resolve, reject) => {
    // Le lookup épinglé garantit que la connexion utilise l'adresse validée.
    const lookup: LookupFunction = (_hostname, options, cb) => {
      if (typeof options === "object" && options && "all" in options && options.all) {
        (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [pinned]);
      } else {
        cb(null, pinned.address, pinned.family);
      }
    };
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        lookup,
        agent: false,
        headers: { "user-agent": opts.userAgent ?? "LimpidFetcher/0.1", accept: opts.allowedContentTypes.join(", ") },
        timeout: opts.timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const rawType = String(res.headers["content-type"] ?? "");
        const contentType = rawType.split(";")[0]!.trim().toLowerCase();
        const charset = /charset\s*=\s*"?([\w-]+)/i.exec(rawType)?.[1] ?? null;
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, location: res.headers.location, contentType, charset, body: Buffer.alloc(0) });
          return;
        }
        const declared = Number(res.headers["content-length"] ?? "0");
        if (declared > opts.maxBytes) {
          res.destroy();
          reject(new UrlRejected("too_large", "Le document en ligne dépasse la taille autorisée."));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > opts.maxBytes) {
            res.destroy();
            reject(new UrlRejected("too_large", "Le document en ligne dépasse la taille autorisée."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, contentType, charset, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    const hardTimeout = setTimeout(() => {
      req.destroy(new UrlRejected("timeout", "Le site a mis trop de temps à répondre."));
    }, opts.timeoutMs);
    req.on("timeout", () => req.destroy(new UrlRejected("timeout", "Le site a mis trop de temps à répondre.")));
    req.on("error", (e) => {
      clearTimeout(hardTimeout);
      reject(e);
    });
    req.on("close", () => clearTimeout(hardTimeout));
    req.end();
  });
}

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const resolver = opts.resolver ?? defaultResolver;
  let url = parsePublicUrl(rawUrl);
  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    const pinned = await resolvePublic(url.hostname, resolver);
    const res = await requestOnce(url, pinned, opts);
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) throw new UrlRejected("http_status", "Redirection invalide.");
      url = parsePublicUrl(new URL(res.location, url).toString());
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      throw new UrlRejected("http_status", `Le site a répondu avec le code ${res.status}.`);
    }
    if (!opts.allowedContentTypes.includes(res.contentType)) {
      throw new UrlRejected("content_type", "Ce type de contenu n'est pas pris en charge.");
    }
    return { finalUrl: url.toString(), contentType: res.contentType, charset: res.charset, body: res.body };
  }
  throw new UrlRejected("too_many_redirects", "Trop de redirections.");
}
