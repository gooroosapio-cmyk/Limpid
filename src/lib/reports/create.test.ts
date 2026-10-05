import { describe, expect, it } from "vitest";
import { kindFromFileName, titleFromFileName } from "@/lib/sources/uploads";
import { CreateRequest, pagesForLength } from "./create";

const params = { level: "grand_public", goal: "comprendre", target_pages: 5, idempotency_key: "cle-de-test-123" };

describe("parcours V3 : réglages automatiques", () => {
  it("accepte une source seule, sans niveau, longueur ni modèle", () => {
    expect(CreateRequest.safeParse({ source_id: crypto.randomUUID(), idempotency_key: "cle-de-test-123" }).success).toBe(true);
  });

  it("déduit la longueur du rapport de la taille du texte lu", () => {
    expect(pagesForLength(0)).toBe(5);
    expect(pagesForLength(12_000)).toBe(5);
    expect(pagesForLength(12_001)).toBe(7);
    expect(pagesForLength(60_000)).toBe(7);
    expect(pagesForLength(60_001)).toBe(12);
  });
});

describe("requête de création", () => {
  it("accepte une source préparée, avec ou sans template", () => {
    const id = crypto.randomUUID();
    expect(CreateRequest.safeParse({ source_id: id, ...params }).success).toBe(true);
    expect(CreateRequest.safeParse({ source_id: id, template: "comparer_options", ...params }).success).toBe(true);
    expect(CreateRequest.safeParse({ source_id: id, template: "inconnu", ...params }).success).toBe(false);
  });

  it("accepte encore les trois sources en un seul envoi", () => {
    expect(CreateRequest.safeParse({ source: "text", text: "Bonjour", ...params }).success).toBe(true);
    expect(CreateRequest.safeParse({ source: "upload", upload_id: crypto.randomUUID(), ...params }).success).toBe(true);
    expect(CreateRequest.safeParse({ source: "url", url: "https://exemple.fr/article", ...params }).success).toBe(true);
  });

  it("reste compatible avec l'ancien envoi de texte sans champ source", () => {
    const r = CreateRequest.safeParse({ text: "Bonjour", ...params });
    expect(r.success && "source" in r.data && r.data.source).toBe("text");
  });

  it("refuse champs inconnus, identifiant d'envoi invalide et clé trop courte", () => {
    expect(CreateRequest.safeParse({ source: "text", text: "x", extra: 1, ...params }).success).toBe(false);
    expect(CreateRequest.safeParse({ source: "upload", upload_id: "../autre", ...params }).success).toBe(false);
    expect(CreateRequest.safeParse({ source: "url", url: "https://a.fr", ...params, idempotency_key: "court" }).success).toBe(false);
  });
});

describe("fichiers envoyés", () => {
  it("déduit le type de l'extension et n'accepte que les formats prévus", () => {
    expect(kindFromFileName("Cours.PDF")).toBe("pdf");
    expect(kindFromFileName("note.docx")).toBe("docx");
    expect(kindFromFileName("a.txt")).toBe("txt");
    expect(kindFromFileName("photo.JPG")).toBe("jpeg");
    expect(kindFromFileName("scan.webp")).toBe("webp");
    expect(kindFromFileName("anim.gif")).toBeNull();
    expect(kindFromFileName("macro.docm")).toBeNull();
    expect(kindFromFileName("sans-extension")).toBeNull();
  });

  it("fait un titre lisible du nom de fichier", () => {
    expect(titleFromFileName("Chapitre 3 - La cellule.pdf")).toBe("Chapitre 3 - La cellule");
    expect(titleFromFileName("\u0007.txt")).toBe("Document");
  });
});
