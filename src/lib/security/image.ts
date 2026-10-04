/**
 * Dimensions d'une image lues dans son en-tête, sans la décoder (payload 1, § 2 :
 * 20 mégapixels maximum). Une image dont l'en-tête est illisible est refusée.
 */
import { FileRejected } from "./file-type";

export type ImageKind = "png" | "jpeg" | "webp";

const u16be = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u32be = (b: Uint8Array, o: number) => ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
const u16le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u24le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);

export function imageSize(buf: Uint8Array, kind: ImageKind): { width: number; height: number } | null {
  if (kind === "png") {
    // Signature (8 octets), puis le bloc IHDR : longueur, « IHDR », largeur, hauteur.
    if (buf.length < 24 || String.fromCharCode(...buf.slice(12, 16)) !== "IHDR") return null;
    return { width: u32be(buf, 16), height: u32be(buf, 20) };
  }
  if (kind === "jpeg") {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) return null;
      const marker = buf[o + 1]!;
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        o += 2;
        continue;
      }
      const len = u16be(buf, o + 2);
      // Marqueurs SOF (début de trame) : 0xC0 à 0xCF sauf DHT (C4), JPG (C8) et DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: u16be(buf, o + 5), width: u16be(buf, o + 7) };
      }
      if (len < 2) return null;
      o += 2 + len;
    }
    return null;
  }
  // WEBP : conteneur RIFF, puis VP8 (avec pertes), VP8L (sans perte) ou VP8X (étendu).
  if (buf.length < 30) return null;
  const chunk = String.fromCharCode(...buf.slice(12, 16));
  if (chunk === "VP8 ") return { width: u16le(buf, 26) & 0x3fff, height: u16le(buf, 28) & 0x3fff };
  if (chunk === "VP8L") {
    const b = buf.slice(21, 25);
    return { width: 1 + (((b[1]! & 0x3f) << 8) | b[0]!), height: 1 + (((b[3]! & 0x0f) << 10) | (b[2]! << 2) | ((b[1]! & 0xc0) >> 6)) };
  }
  if (chunk === "VP8X") return { width: 1 + u24le(buf, 24), height: 1 + u24le(buf, 27) };
  return null;
}

export function checkImageSize(buf: Uint8Array, kind: ImageKind, maxMegapixels: number): { width: number; height: number } {
  const size = imageSize(buf, kind);
  if (!size || size.width < 1 || size.height < 1) throw new FileRejected("unknown_type", "Cette image est illisible ou endommagée.");
  if (size.width * size.height > maxMegapixels * 1_000_000) {
    throw new FileRejected("too_large", `Cette image dépasse ${maxMegapixels} mégapixels.`);
  }
  return size;
}
