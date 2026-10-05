import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { cutPlate, plateGrid } = await import("./plate");

/** Planche de test : fond blanc, un disque coloré centré dans chaque case. */
async function plate(cols: number, rows: number, cell = 300) {
  const discs = Array.from({ length: cols * rows }, (_, i) => {
    const cx = (i % cols) * cell + cell / 2;
    const cy = Math.floor(i / cols) * cell + cell / 2;
    return `<circle cx="${cx}" cy="${cy}" r="${cell / 4}" fill="#396451"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * cell}"><rect width="100%" height="100%" fill="#ffffff"/>${discs}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("planche d'illustrations", () => {
  it("choisit une grille selon le nombre d'images", () => {
    expect(plateGrid(2)).toMatchObject({ cols: 2, rows: 1 });
    expect(plateGrid(4)).toMatchObject({ cols: 2, rows: 2 });
  });

  it("découpe chaque case, rend le fond transparent et recadre au plus près", async () => {
    const cells = await cutPlate(await plate(2, 2), 4);
    expect(cells).toHaveLength(4);
    for (const c of cells) {
      expect(c).not.toBeNull();
      expect(c!.mime).toBe("image/png");
      // Recadré autour du disque (150 px de diamètre dans une case de 300 px).
      expect(c!.width).toBeLessThan(170);
      const { data, info } = await sharp(c!.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(info.channels).toBe(4);
      expect(data[3]).toBe(0); // coin : transparent
      const mid = ((Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4) + 3;
      expect(data[mid]).toBe(255); // centre du disque : opaque
    }
  });

  it("rejette une case vide", async () => {
    const blank = await sharp({ create: { width: 600, height: 300, channels: 3, background: "#ffffff" } }).png().toBuffer();
    expect(await cutPlate(blank, 2)).toEqual([null, null]);
  });
});
