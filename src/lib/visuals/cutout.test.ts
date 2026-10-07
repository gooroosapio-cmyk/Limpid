import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { cutout } = await import("./cutout");

/** Image test : fond magenta, carré blanc (blanc voulu), trait noir fin. */
async function sample(bg: [number, number, number]) {
  const w = 300, h = 200;
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    let c: number[] = bg;
    if (x > 100 && x < 200 && y > 50 && y < 150) c = [255, 255, 255];
    if (y === 100 && x > 20 && x < 280) c = [10, 10, 10];
    px[i] = c[0]!; px[i + 1] = c[1]!; px[i + 2] = c[2]!;
  }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

async function alphaAt(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * info.channels + 3];
}

describe("détourage contrôlé", () => {
  it("retire le fond magenta, garde le blanc voulu et le trait fin", async () => {
    const r = await cutout(await sample([250, 8, 245]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.image.mime).toBe("image/png");
    expect(await alphaAt(r.image.bytes, 5, 5)).toBe(0); // fond
    expect(await alphaAt(r.image.bytes, 150, 80)).toBe(255); // blanc voulu conservé
    expect(await alphaAt(r.image.bytes, 50, 100)).toBe(255); // trait fin conservé
  });

  it("refuse un fond qui n'est pas magenta (rien n'est effacé à tort)", async () => {
    const r = await cutout(await sample([255, 255, 255]));
    expect(r).toEqual({ ok: false, reason: "fond magenta absent" });
  });
});
