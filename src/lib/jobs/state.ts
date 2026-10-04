/**
 * Machine d'états des tâches de génération (payload 1 § 2 ; payload 2 § 2).
 * Les transitions sont validées côté serveur ; la base les revérifie (trigger SQL).
 */

export const JOB_STAGES = [
  "validation",
  "extraction",
  "comprehension",
  "explication",
  "verification",
  "illustrations",
  "mise_en_page",
] as const;
export type JobStage = (typeof JOB_STAGES)[number];

export const JOB_STATUSES = [
  "queued",
  "running",
  "awaiting_confirmation", // extraction partielle : l'utilisateur doit confirmer
  "succeeded",
  "incomplete_check", // contrôle final incomplet : pas d'export présenté comme validé
  "failed",
  "cancelled",
  "uncertain", // timeout ambigu chez le fournisseur : reprise bornée
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const TERMINAL: ReadonlySet<JobStatus> = new Set(["succeeded", "incomplete_check", "failed", "cancelled"]);

const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["running", "awaiting_confirmation", "succeeded", "incomplete_check", "failed", "cancelled", "uncertain", "queued"],
  awaiting_confirmation: ["queued", "cancelled"],
  uncertain: ["queued", "failed", "cancelled"],
  succeeded: [],
  incomplete_check: [],
  failed: ["queued"], // nouvel essai explicite, sans double débit (clé d'idempotence par tentative)
  cancelled: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) throw new Error(`Transition interdite : ${from} → ${to}`);
}

export function nextStage(stage: JobStage): JobStage | null {
  const i = JOB_STAGES.indexOf(stage);
  return i >= 0 && i < JOB_STAGES.length - 1 ? JOB_STAGES[i + 1]! : null;
}

/** Nombre maximal de tentatives par étape (1 essai + 2 réparations, payload 2 § 2-I). */
export const MAX_ATTEMPTS_PER_STAGE = 3;
/** Durée du bail d'un worker ; au-delà sans heartbeat, la tâche peut être reprise. */
export const LEASE_SECONDS = 90;

export const STAGE_LABELS_FR: Record<JobStage, string> = {
  illustrations: "Recherche d'illustrations adaptées",
  validation: "Vérification du document",
  extraction: "Lecture du contenu",
  comprehension: "Repérage des informations",
  explication: "Rédaction des explications",
  verification: "Vérification des sources",
  mise_en_page: "Mise en page",
};
