/**
 * Planche d'illustrations (V4.1) : UNE image générée contient plusieurs illustrations en
 * grille sur fond blanc uni. Le serveur découpe chaque case, rend le fond transparent,
 * recadre au plus près et vérifie le résultat : des images sans arrière-plan, prêtes à être
 * incrustées dans le texte sans se chevaucher.
 */
import "server-only";
import sharp from "sharp";
import { createHash } from "node:crypto";
import type { StoredImage } from "./sources";

import { plateGrid } from "./plate-prompt";

export { PLATE_MAX, plateGrid, platePrompt } from "./plate-prompt";

/** Proche du blanc : transparent ; frange douce entre les deux seuils (bords lissés). */
const OPAQUE_BELOW = 228;
const CLEAR_ABOVE = 246;

/**
 * Découpe la planche en `n` images PNG à fond transparent. Une case vide, presque vide ou
 * illisible est rendue null (l'illustration correspondante passe au repli).
 */
export async function cutPlate(bytes: Buffer, n: number): Promise<(StoredImage | null)[]> {
  const { cols, rows } = plateGrid(n);
  const img = sharp(bytes, { failOn: "error" });
  const meta = await img.metadata();
  if (!meta.width || !meta.height) return Array(n).fill(null);
  const cw = Math.floor(meta.width / cols);
  const ch = Math.floor(meta.height / rows);
  const out: (StoredImage | null)[] = [];
  for (let i = 0; i < n; i++) {
    const left = (i % cols) * cw;
    const top = Math.floor(i / cols) * ch;
    try {
      const { data, info } = await sharp(bytes).extract({ left, top, width: cw, height: ch }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let opaque = 0;
      for (let p = 0; p < data.length; p += 4) {
        const light = Math.min(data[p]!, data[p + 1]!, data[p + 2]!);
        const alpha = light >= CLEAR_ABOVE ? 0 : light <= OPAQUE_BELOW ? 255 : Math.round((255 * (CLEAR_ABOVE - light)) / (CLEAR_ABOVE - OPAQUE_BELOW));
        data[p + 3] = Math.min(data[p + 3]!, alpha);
        if (alpha > 128) opaque++;
      }
      // Moins de 3 % de pixels visibles : case vide ou ratée.
      if (opaque < 0.03 * info.width * info.height) {
        out.push(null);
        continue;
      }
      const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
        .trim({ threshold: 1 })
        .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer({ resolveWithObject: true });
      const { width, height } = png.info;
      // Trop petite après recadrage : inutilisable.
      if (width < 60 || height < 60) {
        out.push(null);
        continue;
      }
      out.push({ bytes: png.data, mime: "image/png", width, height, sha256: createHash("sha256").update(png.data).digest("hex") });
    } catch {
      out.push(null);
    }
  }
  return out;
}
