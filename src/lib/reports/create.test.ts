import { describe, expect, it } from "vitest";
import { kindFromFileName, titleFromFileName } from "@/lib/sources/uploads";
import { CreateRequest } from "./create";

const params = { level: "grand_public", goal: "comprendre", target_pages: 5, idempotency_key: "cle-de-test-123" };

describe("requête de création", () => {
  it("accepte les trois sources", () => {
    expect(CreateRequest.safeParse({ source: "text", text: "Bonjour", ...params }).success).toBe(true);
    expect(CreateRequest.safeParse({ source: "upload", upload_id: crypto.randomUUID(), ...params }).success).toBe(true);
    expect(CreateRequest.safeParse({ source: "url", url: "https://exemple.fr/article", ...params }).success).toBe(true);
  });

  it("reste compatible avec l'ancien envoi de texte sans champ source", () => {
    const r = CreateRequest.safeParse({ text: "Bonjour", ...params });
    expect(r.success && r.data.source).toBe("text");
  });

  it("refuse champs inconnus, identifiant d'envoi invalide et clé trop courte", () => {
    expect(CreateRequest.safeParse({ source: "text", text: "x", extra: 1, ...params }).success).toBe(false);
    expect(CreateRequest.safeParse({ source: "upload", upload_id: "../autre", ...params }).success).toBe(false);
    expect(CreateRequest.safeParse({ source: "url", url: "https://a.fr", ...params, idempotency_key: "court" }).success).toBe(false);
  });
});

describe("fichiers envoyés", () => {
  it("déduit le type de l'extension et n'accepte que PDF, DOCX et TXT", () => {
    expect(kindFromFileName("Cours.PDF")).toBe("pdf");
    expect(kindFromFileName("note.docx")).toBe("docx");
    expect(kindFromFileName("a.txt")).toBe("txt");
    expect(kindFromFileName("photo.jpg")).toBeNull();
    expect(kindFromFileName("macro.docm")).toBeNull();
    expect(kindFromFileName("sans-extension")).toBeNull();
  });

  it("fait un titre lisible du nom de fichier", () => {
    expect(titleFromFileName("Chapitre 3 - La cellule.pdf")).toBe("Chapitre 3 - La cellule");
    expect(titleFromFileName("\u0007.txt")).toBe("Document");
  });
});
