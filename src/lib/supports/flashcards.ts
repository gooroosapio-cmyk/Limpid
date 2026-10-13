/**
 * Banque de flashcards d'un cours (§ 7 et § 12) : une carte = un objectif, une question
 * autonome, une réponse concise vérifiable, une explication courte facultative, ses notions et
 * ses références. Le moteur produit le contenu (brouillon validé) ; le code attribue identifiants
 * stables, couleurs et contrôles sémantiques.
 */
import { z } from "zod";
import { assignColors, COLOR_KEYS, fnv1a, type ColorKey } from "./colors";

export const CARD_KINDS = ["definition", "distinction", "mecanisme", "condition", "etape", "formule", "application", "schema"] as const;
export type CardKind = (typeof CARD_KINDS)[number];

const text = (max: number) => z.string().trim().min(1).max(max);

/** Brouillon produit par le modèle pour un lot de chapitres. */
export const FlashcardDraft = z.strictObject({
  cards: z
    .array(
      z.strictObject({
        chapter_id: text(80),
        kind: z.enum(CARD_KINDS),
        question: text(320),
        answer: text(420),
        explanation: z.string().trim().max(420).nullable(),
        concept_terms: z.array(text(80)).max(4),
        /** Visuel du chapitre nécessaire pour répondre (recto) : seulement s'il ne révèle pas la réponse. */
        front_visual_id: z.string().trim().max(80).nullable(),
        /** Visuel qui éclaire la réponse (verso). */
        back_visual_id: z.string().trim().max(80).nullable(),
        evidence_ids: z.array(text(80)).max(6),
      }),
    )
    .max(60),
});
export type FlashcardDraft = z.infer<typeof FlashcardDraft>;

export const Flashcard = z.strictObject({
  id: z.string().regex(/^fc_[a-z0-9]{6,40}$/),
  version: z.number().int().min(1),
  chapter_id: z.string(),
  kind: z.enum(CARD_KINDS),
  question: z.string(),
  answer: z.string(),
  explanation: z.string().nullable(),
  concept_terms: z.array(z.string()),
  front_visual_id: z.string().nullable(),
  back_visual_id: z.string().nullable(),
  evidence_ids: z.array(z.string()),
  color: z.enum(COLOR_KEYS),
});
export type Flashcard = z.infer<typeof Flashcard>;

export const FlashcardBank = z.strictObject({
  schema: z.literal(1),
  cards: z.array(Flashcard).max(600),
});
export type FlashcardBank = z.infer<typeof FlashcardBank>;

export interface CardContext {
  /** Chapitres du cours (ordre de lecture). */
  chapters: { id: string; visualIds: string[] }[];
  evidenceIds: Set<string>;
  /** Légendes et textes alternatifs des visuels (contrôle de fuite de la réponse au recto). */
  visualText: Map<string, string>;
  terms: Set<string>;
}

/** Texte comparable : minuscules, sans accents ni ponctuation, espaces réduits. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Identifiant stable d'une carte : chapitre + question normalisée (même objectif, même carte). */
export function cardId(chapterId: string, question: string): string {
  const key = `${chapterId}|${normalize(question)}`;
  return `fc_${fnv1a(key).toString(36).padStart(7, "0")}${fnv1a(key, 0x9747b28c).toString(36).padStart(7, "0")}`;
}

/** La réponse figure-t-elle dans le texte montré au recto (question ou visuel) ? */
export function revealsAnswer(front: string, answer: string): boolean {
  const a = normalize(answer);
  if (a.length < 4 || a.split(" ").length > 6) return false;
  return ` ${normalize(front)} `.includes(` ${a} `);
}

export interface CardIssues {
  dropped: { reason: string; question: string }[];
  adjusted: { reason: string; id: string }[];
}

/**
 * Contrôles sémantiques d'un brouillon : chapitre connu, références existantes, visuels du
 * chapitre, recto sans la réponse (y compris légende et texte alternatif), doublons écartés.
 * `previous` : banque antérieure (même identifiant = même couleur, version incrémentée si le
 * contenu change).
 */
export function buildBank(drafts: FlashcardDraft[], ctx: CardContext, seed: string, previous?: FlashcardBank | null): { bank: FlashcardBank; issues: CardIssues } {
  const issues: CardIssues = { dropped: [], adjusted: [] };
  const chapterVisuals = new Map(ctx.chapters.map((c) => [c.id, new Set(c.visualIds)]));
  const order = new Map(ctx.chapters.map((c, i) => [c.id, i]));
  const seen = new Set<string>();
  const rows: Omit<Flashcard, "color" | "version">[] = [];
  for (const draft of drafts) {
    for (const c of draft.cards) {
      const visuals = chapterVisuals.get(c.chapter_id);
      if (!visuals) {
        issues.dropped.push({ reason: "chapitre inconnu", question: c.question });
        continue;
      }
      const key = normalize(c.question);
      if (!key || seen.has(`${c.chapter_id}|${key}`)) {
        issues.dropped.push({ reason: "doublon", question: c.question });
        continue;
      }
      if (revealsAnswer(c.question, c.answer)) {
        issues.dropped.push({ reason: "réponse dans la question", question: c.question });
        continue;
      }
      seen.add(`${c.chapter_id}|${key}`);
      const id = cardId(c.chapter_id, c.question);
      let front = c.front_visual_id && visuals.has(c.front_visual_id) ? c.front_visual_id : null;
      let back = c.back_visual_id && visuals.has(c.back_visual_id) ? c.back_visual_id : null;
      // Un visuel dont la légende ou le texte alternatif contient la réponse passe au verso.
      if (front && revealsAnswer(ctx.visualText.get(front) ?? "", c.answer)) {
        issues.adjusted.push({ reason: "visuel du recto déplacé au verso (révèle la réponse)", id });
        back = back ?? front;
        front = null;
      }
      if (front && front === back) back = null;
      rows.push({
        id,
        chapter_id: c.chapter_id,
        kind: c.kind,
        question: c.question,
        answer: c.answer,
        explanation: c.explanation && c.explanation !== c.answer ? c.explanation : null,
        concept_terms: c.concept_terms.filter((t) => ctx.terms.has(t.toLowerCase())),
        front_visual_id: front,
        back_visual_id: back,
        evidence_ids: [...new Set(c.evidence_ids.filter((e) => ctx.evidenceIds.has(e)))],
      });
    }
  }
  rows.sort((a, b) => (order.get(a.chapter_id) ?? 0) - (order.get(b.chapter_id) ?? 0));
  const prev = new Map((previous?.cards ?? []).map((c) => [c.id, c]));
  const colors = assignColors(
    rows.map((r) => r.id),
    seed,
    new Map([...prev.values()].map((c) => [c.id, c.color as ColorKey])),
  );
  const cards: Flashcard[] = rows.map((r) => {
    const old = prev.get(r.id);
    const same = old && old.answer === r.answer && old.question === r.question && old.explanation === r.explanation;
    return { ...r, version: old ? (same ? old.version : old.version + 1) : 1, color: colors.get(r.id)! };
  });
  return { bank: { schema: 1, cards }, issues };
}
