/**
 * Progression du lecteur V5 (référentiel, PRO-01 à PRO-03) : trois dimensions séparées, qui
 * peuvent coexister. Consulter, replier ou ouvrir un chapitre ne valide aucune compétence ;
 * une réussite aidée (variante proposée après une correction) n'efface jamais une erreur.
 */

export interface AttemptAnswer {
  id: string;
  correct: boolean | null;
  /** Variante proposée après une erreur sur cette question. */
  variant_of?: string | null;
  /** Réponse donnée après une correction (réussite aidée). */
  aided?: boolean;
}

export interface SectionAttempt {
  section_id: string | null;
  created_at: string;
  answers: AttemptAnswer[];
}

export interface PracticeState {
  /** Au moins une réponse juste sans aide. */
  success: boolean;
  /** Une question dont la dernière réponse autonome est fausse : notion à revoir. */
  review: boolean;
}

/** État d'entraînement par chapitre, à partir des tentatives de fin de chapitre conservées. */
export function practiceBySection(attempts: SectionAttempt[]): Record<string, PracticeState> {
  const sorted = [...attempts].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const latest = new Map<string, Map<string, boolean>>();
  const success = new Set<string>();
  for (const a of sorted) {
    if (!a.section_id) continue;
    const per = latest.get(a.section_id) ?? new Map<string, boolean>();
    latest.set(a.section_id, per);
    for (const ans of a.answers) {
      if (ans.correct === null || ans.aided || ans.variant_of) continue;
      per.set(ans.id, ans.correct);
      if (ans.correct) success.add(a.section_id);
    }
    // Une variante réussie après une erreur reste une réussite aidée : la notion reste à revoir.
  }
  const out: Record<string, PracticeState> = {};
  for (const [section, per] of latest) {
    out[section] = { success: success.has(section), review: [...per.values()].some((ok) => !ok) };
  }
  return out;
}

/** Sous-chapitre (ou chapitre sans sous-chapitre) affiché assez longtemps : simple observation d'usage. */
export const CONSULTED_MS = 2_000;
export const consultedKey = (reportId: string) => `limpid-consulted-${reportId}`;
