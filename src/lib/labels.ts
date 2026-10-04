import type { Level } from "@/lib/contracts/schemas";

/** Noms de style d'explication : ils décrivent un style, jamais une personne (payload 1, § 4). */
export const LEVEL_LABELS: Record<Level, string> = {
  ultra_simple: "Ultra simple",
  grand_public: "Grand public",
  etudiant: "Étudiant",
  professionnel: "Professionnel",
  expert_presse: "Expert pressé",
};

/** Ce que change chaque style (écran « Votre rapport »). */
export const LEVEL_DESCRIPTIONS: Record<Level, string> = {
  ultra_simple: "Des mots courants, une idée à la fois, des exemples concrets.",
  grand_public: "Un langage clair, les liens essentiels et les limites expliqués.",
  etudiant: "Définitions précises, prérequis, glossaire et questions de vérification.",
  professionnel: "Fonctionnement, conséquences pratiques et conditions d'application.",
  expert_presse: "Un texte dense qui garde hypothèses et chiffres, sans étapes inutiles.",
};

export const GOAL_LABELS = { comprendre: "Comprendre", reviser: "Réviser", appliquer: "Appliquer", decider: "Décider" } as const;

export const TEMPLATE_LABELS = {
  comprendre_sujet: "Comprendre un sujet",
  expliquer_document: "Expliquer un document",
  comprendre_processus: "Comprendre un processus",
  comparer_options: "Comparer des options",
} as const;
