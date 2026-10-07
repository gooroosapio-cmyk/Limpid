import { describe, expect, it } from "vitest";
import { aiTier, expertCalls, imageCap, imageFallbackCap, imagesPerChapter, isInternalPro, ocrAllowed } from "./tier";

describe("parcours IA par forfait", () => {
  it("Essentiel suit Gratuit ; Plus et Pro ont leur parcours ; droit Pro interne", () => {
    expect(aiTier("free", "free")).toBe("free");
    expect(aiTier("essential", "subscription")).toBe("free");
    expect(aiTier("essential", "topup")).toBe("free");
    expect(aiTier("plus", "subscription")).toBe("plus");
    expect(aiTier("pro", "subscription")).toBe("pro");
    expect(aiTier("free", "free", true)).toBe("pro");
  });

  it("droit Pro interne : seulement les adresses configurées", () => {
    expect(isInternalPro("GooroosApio@gmail.com", {} as never)).toBe(true);
    expect(isInternalPro("autre@gmail.com", {} as never)).toBe(false);
    expect(isInternalPro("a@b.co", { LIMPID_INTERNAL_PRO_EMAILS: "a@b.co" } as never)).toBe(true);
    expect(isInternalPro("gooroosapio@gmail.com", { LIMPID_INTERNAL_PRO_EMAILS: "a@b.co" } as never)).toBe(false);
  });

  it("images par cours selon forfait et approche (lecteur V3)", () => {
    expect([imageCap("free", "auto"), imageCap("plus", "auto"), imageCap("pro", "auto")]).toEqual([2, 5, 10]);
    expect([imageCap("free", "livre"), imageCap("plus", "livre"), imageCap("pro", "livre")]).toEqual([2, 4, 8]);
    expect([imageCap("free", "parcours"), imageCap("plus", "parcours"), imageCap("pro", "parcours")]).toEqual([2, 3, 6]);
    expect(imageCap("pro", "claire")).toBe(10);
    expect([imagesPerChapter("parcours"), imagesPerChapter("livre")]).toEqual([1, 2]);
  });

  it("secours d'image, Sol et OCR selon le niveau", () => {
    expect([imageFallbackCap("free"), imageFallbackCap("plus"), imageFallbackCap("pro")]).toEqual([1, 2, 3]);
    expect([expertCalls("free"), expertCalls("plus"), expertCalls("pro")]).toEqual([0, 0, 2]);
    expect([ocrAllowed("free"), ocrAllowed("plus"), ocrAllowed("pro")]).toEqual([false, false, true]);
  });
});
