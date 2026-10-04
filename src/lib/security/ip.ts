/**
 * Classification des adresses IP pour la protection SSRF (payload 1, § 6).
 * Seules les adresses unicast publiques sont autorisées, en IPv4 comme en IPv6.
 */
import { isIP } from "node:net";

type Cidr4 = [number, number]; // [réseau en entier 32 bits, longueur de préfixe]

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

const BLOCKED_V4: Cidr4[] = (
  [
    ["0.0.0.0", 8], // « ce réseau »
    ["10.0.0.0", 8], // privé
    ["100.64.0.0", 10], // CGNAT
    ["127.0.0.0", 8], // loopback
    ["169.254.0.0", 16], // link-local, métadonnées cloud (169.254.169.254)
    ["172.16.0.0", 12], // privé
    ["192.0.0.0", 24], // affectations IETF
    ["192.0.2.0", 24], // documentation
    ["192.88.99.0", 24], // relais 6to4
    ["192.168.0.0", 16], // privé
    ["198.18.0.0", 15], // tests de performance
    ["198.51.100.0", 24], // documentation
    ["203.0.113.0", 24], // documentation
    ["224.0.0.0", 4], // multicast
    ["240.0.0.0", 4], // réservé + broadcast
  ] as const
).map(([net, len]) => [ipv4ToInt(net)!, len]);

function inCidr4(ip: number, [net, len]: Cidr4): boolean {
  if (len === 0) return true;
  const mask = len === 32 ? 0xffffffff : (~((1 << (32 - len)) - 1)) >>> 0;
  return ((ip & mask) >>> 0) === ((net & mask) >>> 0);
}

export function isPublicIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  return !BLOCKED_V4.some((c) => inCidr4(n, c));
}

/** Développe une adresse IPv6 en 8 groupes de 16 bits. Retourne null si invalide. */
export function expandIPv6(ip: string): number[] | null {
  let addr = ip.toLowerCase();
  const zone = addr.indexOf("%");
  if (zone >= 0) return null; // les zones (fe80::1%eth0) ne sont jamais légitimes ici
  // Suffixe IPv4 intégré (::ffff:1.2.3.4)
  const lastColon = addr.lastIndexOf(":");
  const tail = addr.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = ipv4ToInt(tail);
    if (v4 === null) return null;
    addr = `${addr.slice(0, lastColon + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const parse = (s: string) => (s === "" ? [] : s.split(":"));
  const head = parse(halves[0]!);
  const rest = halves.length === 2 ? parse(halves[1]!) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 && head.length !== 8) return null;
  if (halves.length === 2 && missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

export function isPublicIPv6(ip: string): boolean {
  const g = expandIPv6(ip);
  if (!g) return false;
  const [a, b, c, d, e, f, g6, h] = g as [number, number, number, number, number, number, number, number];
  const embeddedV4 = () => `${g6 >> 8}.${g6 & 0xff}.${h >> 8}.${h & 0xff}`;

  if (g.every((x) => x === 0)) return false; // ::
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0 && g6 === 0 && h === 1) return false; // ::1
  // IPv4 mappée (::ffff:0:0/96) ou compatible (::/96) : juger l'IPv4 sous-jacente
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && (f === 0xffff || f === 0)) return isPublicIPv4(embeddedV4());
  if (a === 0x64 && b === 0xff9b) return false; // NAT64 64:ff9b::/96 et 64:ff9b:1::/48
  if (a === 0x100 && b === 0 && c === 0 && d === 0) return false; // discard 100::/64
  if (a === 0x2001 && b < 0x200) return false; // 2001::/23 (Teredo, ORCHID, benchmark…)
  if (a === 0x2001 && b === 0xdb8) return false; // documentation
  if (a === 0x2002) return false; // 6to4 : encapsule une IPv4 arbitraire
  if (a === 0x3fff && b < 0x1000) return false; // documentation 3fff::/20
  if ((a & 0xfe00) === 0xfc00) return false; // ULA fc00::/7
  if ((a & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((a & 0xffc0) === 0xfec0) return false; // site-local déprécié
  if ((a & 0xff00) === 0xff00) return false; // multicast
  // Seul l'espace unicast global 2000::/3 est autorisé.
  return (a & 0xe000) === 0x2000;
}

export function isPublicIP(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPublicIPv4(ip);
  if (family === 6) return isPublicIPv6(ip);
  return false;
}
