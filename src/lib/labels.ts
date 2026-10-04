import type { Level } from "@/lib/contracts/schemas";

/** Noms de style d'explication : ils décrivent un style, jamais une personne (payload 1, § 4). */
export const LEVEL_LABELS: Record<Level, string> = {
  ultra_simple: "Ultra simple",
  grand_public: "Grand public",
  etudiant: "Étudiant",
  professionnel: "Professionnel",
  expert_presse: "Expert pressé",
};
