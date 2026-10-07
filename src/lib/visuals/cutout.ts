/**
 * Détourage contrôlé (prompt V2, étape 9) : les schémas, illustrations et dessins sont générés
 * sur un fond uniforme magenta (#FF00FF, absent de la charte) ; le serveur le retire, adoucit
 * les bords, enlève le reflet magenta et vérifie le vrai canal alpha. Les blancs voulus, les
 * traits fins, les signes moins et les graduations ne sont jamais effacés : seule la couleur
 * de fond est retirée, jamais « tous les pixels blancs ».
 */
import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { StoredImage } from "./sources";

/** Consigne ajoutée aux prompts des visuels sans arrière-plan. */
export const KEY_BACKGROUND_PROMPT =
  "Background: one perfectly flat, uniform pure magenta (#FF00FF) filling the whole canvas behind the subject; no gradient, no texture, no shadow, no floor, no frame. Never use magenta or pink anywhere in the subject itself.";

/** Distance couleur (0–441) en dessous de laquelle un pixel est du fond, puis zone de transition. */
const HARD = 60;
const SOFT = 140;

export type CutoutResult = { ok: true; image: StoredImage; transparentShare: number } | { ok: false; reason: string };

/** Couleur de fond réellement rendue : médiane des quatre coins (le modèle n'est jamais exact). */
function keyColor(px: Buffer, w: number, h: number, ch: number): [number, number, number] {
  const samples: number[][] = [];
  const box = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  for (const [cx, cy] of [[0, 0], [w - box, 0], [0, h - box], [w - box, h - box]] as const) {
    for (let y = cy; y < cy + box; y++) for (let x = cx; x < cx + box; x++) {
      const i = (y * w + x) * ch;
      samples.push([px[i]!, px[i + 1]!, px[i + 2]!]);
    }
  }
  const med = (k: number) => samples.map((s) => s[k]!).sort((a, b) => a - b)[Math.floor(samples.length / 2)]!;
  return [med(0), med(1), med(2)];
}

/** Retire le fond magenta et vérifie le résultat ; refuse plutôt que publier un visuel abîmé. */
export async function cutout(input: Buffer): Promise<CutoutResult> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const [kr, kg, kb] = keyColor(data, w, h, ch);
  // Un fond qui n'est pas magenta (le modèle a ignoré la consigne) : rien à détourer sans risque.
  if (!(kr > 170 && kb > 170 && kg < 110)) return { ok: false, reason: "fond magenta absent" };
  let transparent = 0;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const d = Math.hypot(r - kr, g - kg, b - kb);
    let a = 255;
    if (d < HARD) a = 0;
    else if (d < SOFT) a = Math.round(((d - HARD) / (SOFT - HARD)) * 255);
    if (a < 255) {
      // Reflet magenta des bords : on retire la composante de fond mélangée.
      const t = 1 - a / 255;
      data[i] = Math.max(0, Math.min(255, Math.round((r - kr * t) / Math.max(1 - t, 0.05))));
      data[i + 1] = Math.max(0, Math.min(255, Math.round((g - kg * t) / Math.max(1 - t, 0.05))));
      data[i + 2] = Math.max(0, Math.min(255, Math.round((b - kb * t) / Math.max(1 - t, 0.05))));
    }
    data[i + 3] = Math.min(data[i + 3]!, a);
    if (a === 0) transparent++;
  }
  const share = transparent / (w * h);
  // Contrôle du canal alpha réel : un fond retiré, mais un sujet bien présent.
  if (share < 0.05) return { ok: false, reason: "fond non retiré" };
  if (share > 0.97) return { ok: false, reason: "sujet effacé" };
  const corners = [0, (w - 1) * ch, (h - 1) * w * ch, ((h - 1) * w + w - 1) * ch].every((i) => data[i + 3] === 0);
  if (!corners) return { ok: false, reason: "coins encore opaques" };
  const bytes = await sharp(data, { raw: { width: w, height: h, channels: ch } }).png({ compressionLevel: 9 }).toBuffer();
  return {
    ok: true,
    transparentShare: share,
    image: { bytes, mime: "image/png", width: w, height: h, sha256: createHash("sha256").update(bytes).digest("hex") },
  };
}
