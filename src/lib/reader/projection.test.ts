import { describe, expect, it } from "vitest";
import { autoProjection, isProjectionChoice, resolveProjection } from "./projection";

const stats = (o: Partial<{ chapters: number; steps: number; visuals: number; paragraphs: number }> = {}) => ({ chapters: 4, steps: 0, visuals: 0, paragraphs: 20, ...o });

describe("projections du lecteur V3", () => {
  it("l'approche demandée à la génération décide d'abord", () => {
    expect(autoProjection("parcours", stats()).projection).toBe("guided");
    expect(autoProjection("atelier", stats()).projection).toBe("visual");
    expect(autoProjection("livre", stats({ steps: 10 })).projection).toBe("book");
  });

  it("étapes dépendantes → guidé ; représentations nombreuses → visuel ; sinon livre", () => {
    expect(autoProjection(null, stats({ steps: 2 }))).toEqual({ projection: "guided", reason: "steps" });
    expect(autoProjection("auto", stats({ visuals: 8, paragraphs: 12 }))).toEqual({ projection: "visual", reason: "visuals" });
    // Beaucoup de texte et peu de représentations : la longueur ne suffit pas.
    expect(autoProjection(null, stats({ visuals: 8, paragraphs: 60 })).projection).toBe("book");
    expect(autoProjection(null, stats())).toEqual({ projection: "book", reason: "default" });
  });

  it("une préférence explicite remplace le choix automatique", () => {
    expect(resolveProjection("visual", "parcours", stats())).toEqual({ projection: "visual", reason: null });
    expect(isProjectionChoice("guided")).toBe(true);
    expect(isProjectionChoice("carousel")).toBe(false);
  });
});
