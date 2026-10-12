import { describe, expect, it } from "vitest";
import { routeTemplate } from "./client";

describe("mesures navigateur", () => {
  it("réduit l'adresse à son modèle, sans identifiant ni paramètre", () => {
    expect(routeTemplate("/rapports/3f2a9c1e-1111-2222-3333-444455556666/pdf?version=2#sec_1")).toBe("/rapports/:id/pdf");
    expect(routeTemplate("/bibliotheque?dossier=abc")).toBe("/bibliotheque");
    expect(routeTemplate("/lecon/12")).toBe("/lecon/:id");
  });
});
