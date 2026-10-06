import { describe, expect, it } from "vitest";
import { coverQuery, pixabayHits } from "./cover-gen";

describe("couvertures Pixabay", () => {
  it("garde les images Pixabay assez larges, avec page publique et auteur", () => {
    const hits = pixabayHits({
      hits: [
        { largeImageURL: "https://pixabay.com/get/abc.jpg", pageURL: "https://pixabay.com/illustrations/x-1/", user: "Ana", imageWidth: 1920, imageHeight: 1280 },
        { largeImageURL: "https://evil.example/a.jpg", pageURL: "https://pixabay.com/x/", imageWidth: 1920 },
        { largeImageURL: "https://cdn.pixabay.com/small.jpg", pageURL: "https://pixabay.com/y/", imageWidth: 400 },
        { webformatURL: "http://pixabay.com/get/b.jpg", pageURL: "https://pixabay.com/z/", imageWidth: 1600 },
      ],
    });
    expect(hits).toEqual([{ imageUrl: "https://pixabay.com/get/abc.jpg", pageUrl: "https://pixabay.com/illustrations/x-1/", author: "Ana", width: 1920, height: 1280 }]);
  });

  it("mots-clés du plan en anglais, sinon les mots du titre en français", () => {
    expect(coverQuery("water cycle, rain!", "Le cycle")).toEqual({ q: "water cycle rain", lang: "en" });
    expect(coverQuery("", "Comprendre la simulation financière du projet")).toEqual({ q: "Comprendre simulation financière projet", lang: "fr" });
    expect(coverQuery("", "Le")).toBeNull();
  });
});
