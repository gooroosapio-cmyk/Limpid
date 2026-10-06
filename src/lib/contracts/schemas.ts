/**
 * Contrats versionnés du moteur (payload 2, § 5).
 * Tous les objets sont stricts : un champ inattendu est refusé.
 * Les offsets sont exprimés en unités de code UTF-16 dans le texte normalisé figé
 * du segment (unité de String.prototype.slice en JavaScript).
 */
import { z } from "zod";

/**
 * 1.1.0 (refonte V4) : modes, points clés, blocs liste/étapes, formule, complément, variantes
 * d'exemples, intentions de placement des visuels. Ajouts facultatifs : les objets 1.0.0
 * enregistrés restent valides et lisibles.
 */
export const SCHEMA_VERSION = "1.1.0" as const;
const schemaVersion = z.enum(["1.0.0", "1.1.0"]);

const id = z.string().regex(/^[a-z]{1,6}_[A-Za-z0-9_-]{1,64}$/, "identifiant invalide");
const shortText = z.string().trim().min(1).max(500);
const mediumText = z.string().trim().min(1).max(2_000);
const longText = z.string().trim().min(1).max(8_000);
const ids = (max = 50) => z.array(id).max(max);

export const LEVELS = ["ultra_simple", "grand_public", "etudiant", "professionnel", "expert_presse"] as const;
export const Level = z.enum(LEVELS);
export type Level = z.infer<typeof Level>;

export const GOALS = ["comprendre", "reviser", "appliquer", "decider"] as const;
export const Goal = z.enum(GOALS);
export type Goal = z.infer<typeof Goal>;

export const TEMPLATES = ["comprendre_sujet", "expliquer_document", "comprendre_processus", "comparer_options"] as const;
export const TemplateId = z.enum(TEMPLATES);

/** Présentation (kit V3) : change la composition, jamais le contenu ni les faits. */
export const THEMES = ["sciences", "recit", "dossier", "guide", "confort"] as const;
export const ThemeId = z.enum(THEMES);
export type ThemeId = z.infer<typeof ThemeId>;

/** Visuels permis à la génération (cahier V2, § 7 et 9). */
export const VISUAL_MODES = ["auto", "schemas", "web", "gemini", "aucun"] as const;
export const VisualMode = z.enum(VISUAL_MODES);
export type VisualMode = z.infer<typeof VisualMode>;

/** Pages pédagogiques prévues (plan) : 5 à 18 selon la richesse ; moins si la source est pauvre. */
export const TargetPages = z.number().int().min(1).max(18);
export type TargetPages = z.infer<typeof TargetPages>;

/**
 * Approches choisies à l'import. V6 : « auto » (Par défaut : le plan choisit l'approche
 * dominante), « livre » (Livre interactif), « parcours » (Parcours guidé), « atelier » (Atelier
 * visuel). Les quatre approches V4 restent lisibles pour les cours déjà produits.
 */
export const MODES = ["tres_simple", "claire", "resume", "revision", "auto", "livre", "parcours", "atelier"] as const;
/** Approches proposées à l'import (V6). */
export const V6_MODES = ["auto", "livre", "parcours", "atelier"] as const;
/** Approche effective d'un chapitre (V6). */
export const APPROACHES = ["livre", "parcours", "atelier"] as const;
export const Approach = z.enum(APPROACHES);
export type Approach = z.infer<typeof Approach>;
export const Mode = z.enum(MODES);
export type Mode = z.infer<typeof Mode>;

/* ---------- Source et preuves ---------- */

export const Locator = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("pdf_page"),
    physical_index: z.number().int().min(1).max(10_000),
    printed_label: z.string().max(20).nullable(),
  }),
  z.strictObject({
    kind: z.literal("section"),
    heading_path: z.array(z.string().max(300)).max(10),
    paragraph: z.number().int().min(1).max(100_000),
  }),
  z.strictObject({ kind: z.literal("image"), region: z.string().max(100).nullable() }),
  z.strictObject({ kind: z.literal("slide"), index: z.number().int().min(1).max(2_000) }),
]);
export type Locator = z.infer<typeof Locator>;

export const SourceSegment = z.strictObject({
  id,
  source_id: id,
  source_version: z.string().regex(/^[a-f0-9]{64}$/),
  locator: Locator,
  text: z.string().max(20_000),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  extraction_warnings: z.array(shortText).max(20),
});
export type SourceSegment = z.infer<typeof SourceSegment>;

export const Evidence = z
  .strictObject({
    id,
    segment_id: id,
    start_offset: z.number().int().min(0),
    end_offset: z.number().int().min(1),
    quote: z.string().min(1).max(1_000),
  })
  .refine((e) => e.end_offset > e.start_offset, "end_offset doit dépasser start_offset");
export type Evidence = z.infer<typeof Evidence>;

/* ---------- KnowledgeObject ---------- */

export const NumberFact = z.strictObject({
  value: z.number().finite(),
  unit: z.string().max(40).nullable(),
  scope: z.string().max(200).nullable(),
  date: z.string().max(60).nullable(),
  source_form: z.string().min(1).max(120),
});

/**
 * Appui d'une affirmation par ses extraits (cahier V2, § 5) : soutenue, partiellement
 * soutenue, ambiguë, non soutenue, contredite. Aucun pourcentage de vérité artificiel.
 */
export const SupportStatus = z.enum(["supported", "partial", "ambiguous", "unsupported", "contradicted"]);
export type SupportStatus = z.infer<typeof SupportStatus>;

export const Claim = z.strictObject({
  id,
  statement: mediumText,
  evidence_ids: ids(10),
  qualifiers: z.array(z.string().max(120)).max(10),
  numbers: z.array(NumberFact).max(20),
  support_status: SupportStatus,
});
export type Claim = z.infer<typeof Claim>;

export const Concept = z.strictObject({
  id,
  label: shortText,
  definition_claim_ids: ids(10),
  importance: z.enum(["central", "secondary"]),
  prerequisite_ids: ids(10),
});

export const Relation = z.strictObject({
  id,
  from_id: id,
  to_id: id,
  kind: z.enum(["causes", "enables", "part_of", "precedes", "contrasts", "example_of", "correlates"]),
  claim_ids: ids(10).min(1),
});

export const Contradiction = z.strictObject({
  id,
  claim_ids: ids(10).min(2),
  description: mediumText,
});

export const Coverage = z.strictObject({
  segments_total: z.number().int().min(0),
  segments_processed: z.number().int().min(0),
  unreadable_locators: z.array(Locator).max(200),
  partial: z.boolean(),
});

export const KnowledgeObject = z.strictObject({
  schema_version: schemaVersion,
  id,
  source_ids: ids(10).min(1), // V5 : jusqu'à 10 documents (Limpid commun)
  // V5 : jusqu'à ~150 pages lues par fragments.
  concepts: z.array(Concept).max(400),
  claims: z.array(Claim).max(2_000),
  relations: z.array(Relation).max(800),
  contradictions: z.array(Contradiction).max(150),
  missing_information: z.array(mediumText).max(150),
  coverage: Coverage,
});
export type KnowledgeObject = z.infer<typeof KnowledgeObject>;

/* ---------- ExplanationObject ---------- */

const blockBase = {
  id,
  text: longText,
  claim_ids: ids(20),
  evidence_ids: ids(20),
};

/** Opérations de calcul manipulables (kit V6) : aucune autre n'est évaluée. */
export const CALCULATIONS = ["share", "sum", "difference", "ratio", "percent_change"] as const;
/** Illustrations de contexte locales (kit V6, CC0), servies depuis /illustrations/scenes/. */
export const SCENES = ["home-work", "childcare", "science", "reading", "story", "process", "landscape", "resources"] as const;
const sourced = { claim_ids: ids(10), evidence_ids: ids(10) };
const stepItem = z.strictObject({ title: z.string().trim().min(1).max(160), text: mediumText, ...sourced });
const eventItem = z.strictObject({ date: z.string().trim().min(1).max(60), title: z.string().trim().min(1).max(160), text: mediumText, ...sourced });

/** Variante d'un exemple ou d'une analogie, affichée sans nouvel appel IA (« Autre exemple »). */
export const ExampleVariant = z.strictObject({ text: longText, limit: mediumText.nullable() });

const listItem = z.strictObject({ text: mediumText, claim_ids: ids(10), evidence_ids: ids(10) });

export const Block = z.discriminatedUnion("type", [
  // emphasis « key » : idée à retenir mise en avant (sans encadré systématique).
  z.strictObject({ type: z.literal("fact"), emphasis: z.enum(["key"]).optional(), ...blockBase }),
  z.strictObject({ type: z.literal("definition"), term: shortText, ...blockBase }),
  z.strictObject({ type: z.literal("analogy"), limit: mediumText, variants: z.array(ExampleVariant).max(2).optional(), ...blockBase }),
  z.strictObject({ type: z.literal("fictional_example"), variants: z.array(ExampleVariant).max(2).optional(), ...blockBase }),
  z.strictObject({ type: z.literal("inference"), ...blockBase }),
  z.strictObject({ type: z.literal("caution"), ...blockBase }),
  // Liste, liste numérotée ou étapes : text = phrase d'introduction.
  z.strictObject({ type: z.literal("list"), style: z.enum(["bullets", "numbers", "steps"]), items: z.array(listItem).min(2).max(12), ...blockBase }),
  // Formule : expression exacte, symboles expliqués, puis text = lecture et application.
  z.strictObject({
    type: z.literal("formula"),
    expression: shortText,
    symbols: z.array(z.strictObject({ symbol: z.string().trim().min(1).max(40), meaning: shortText })).max(12),
    ...blockBase,
  }),
  // Complément absent de la source : signalé « Complément », jamais référencé comme sourcé.
  z.strictObject({ type: z.literal("complement"), ...blockBase }),
  /* V6 : composants du lecteur, dessinés par le code à partir de données exactes (jamais d'image). */
  // Étapes d'une procédure : ordre obligatoire conservé ; text = phrase d'introduction.
  z.strictObject({ type: z.literal("steps"), items: z.array(stepItem).min(2).max(12), ...blockBase }),
  // Frise : ordre chronologique ou narratif annoncé ; text = introduction.
  z.strictObject({ type: z.literal("timeline"), order: z.enum(["chronologique", "narratif"]), events: z.array(eventItem).min(2).max(12), ...blockBase }),
  // Tableau comparatif : en-têtes, puis lignes (cellule vide = valeur manquante, jamais zéro).
  z.strictObject({
    type: z.literal("comparison"),
    columns: z.array(z.string().trim().min(1).max(80)).min(2).max(5),
    rows: z.array(z.strictObject({ cells: z.array(z.string().trim().max(300)).min(2).max(5), ...sourced })).min(1).max(15),
    ...blockBase,
  }),
  // Part d'un tout : base, pourcentage, part et reste ; curseur si interactive (simulation locale).
  z.strictObject({
    type: z.literal("proportion"),
    base: z.number().finite().positive(),
    percent: z.number().finite().min(0).max(100),
    unit: z.string().trim().max(20),
    part_label: z.string().trim().min(1).max(60),
    rest_label: z.string().trim().min(1).max(60),
    interactive: z.boolean(),
    /** Valeurs d'un exemple pédagogique (affiché « Exemple fictif »), sinon reprises de la source. */
    example: z.boolean(),
    ...blockBase,
  }),
  // Graphique (barres ou courbe) + tableau équivalent ; valeur absente = null, jamais inventée.
  z.strictObject({
    type: z.literal("chart"),
    chart_type: z.enum(["bar", "line"]),
    unit: z.string().trim().max(20),
    points: z.array(z.strictObject({ label: z.string().trim().min(1).max(60), value: z.number().finite().nullable() })).min(2).max(12),
    ...blockBase,
  }),
  // Calcul manipulable : 5 opérations sûres, aucune expression évaluée ; steps = calcul décomposé.
  z.strictObject({
    type: z.literal("calculation"),
    formula_id: z.enum(CALCULATIONS),
    variables: z.array(z.strictObject({ label: z.string().trim().min(1).max(60), value: z.number().finite(), unit: z.string().trim().max(20) })).length(2),
    steps: z.array(mediumText).max(6),
    interactive: z.boolean(),
    example: z.boolean(),
    ...blockBase,
  }),
  // Détail secondaire repliable : summary = intitulé, text = contenu (développé dans le PDF).
  z.strictObject({ type: z.literal("details"), summary: shortText, ...blockBase }),
  // Illustration de contexte du catalogue local (aucune génération) : text = légende.
  z.strictObject({ type: z.literal("scene"), asset: z.enum(SCENES), ...blockBase }),
]);
export type Block = z.infer<typeof Block>;

/** Notion à toucher (V5) : définition et exemple préproduits, aucun appel IA au toucher. */
export const Notion = z.strictObject({
  term: z.string().trim().min(1).max(80),
  definition: mediumText,
  example: mediumText.nullable(),
  claim_ids: ids(10),
});
export type Notion = z.infer<typeof Notion>;

/**
 * QCM de chapitre (kit V6) : 1 à 3 questions produites avec le chapitre, corrigées sur place
 * sans appel IA ; une explication par choix ; jamais une note de maîtrise.
 */
export const ChapterQuestion = z
  .strictObject({
    id,
    prompt: mediumText,
    choices: z.array(z.string().trim().min(1).max(300)).min(2).max(4),
    correct_index: z.number().int().min(0).max(3),
    explanations: z.array(mediumText).min(2).max(4),
    /** Bloc à revoir en cas d'erreur (identifiant du chapitre), ou null. */
    revisit_block_id: id.nullable(),
    claim_ids: ids(10),
  })
  .refine((q) => q.correct_index < q.choices.length && q.explanations.length === q.choices.length, "choix, bonne réponse et explications incohérents");
export type ChapterQuestion = z.infer<typeof ChapterQuestion>;

export const Section = z.strictObject({
  id,
  question: shortText,
  takeaway: mediumText,
  blocks: z.array(Block).min(1).max(40),
  /** V5 : 2 à 4 idées « À retenir » en fin de chapitre. */
  retain: z.array(shortText).max(5).optional(),
  /** V5 : notions soulignées dans le chapitre (premières occurrences utiles). */
  notions: z.array(Notion).max(8).optional(),
  /** V5 : chapitre rédigé par le modèle le plus capable (passage difficile). */
  difficult: z.boolean().optional(),
  /** V6 : approche du chapitre (Par défaut : choisie par le plan). */
  approach: Approach.optional(),
  /** V6 : « L'essentiel » du chapitre, en puces. */
  essential: z.array(shortText).max(6).optional(),
  /** V6 : QCM facultatif de fin de chapitre. */
  quiz: z.array(ChapterQuestion).max(3).optional(),
});
export type Section = z.infer<typeof Section>;

export const GlossaryEntry = z.strictObject({
  term: shortText,
  definition: mediumText,
  claim_ids: ids(10),
});

export const ComprehensionCheck = z.strictObject({
  id,
  question: mediumText,
  expected_points: z.array(mediumText).min(1).max(10),
  evidence_ids: ids(10).min(1),
  misconception_hints: z.array(mediumText).max(10),
});

export const PreferencesSnapshot = z.strictObject({
  aids: z.array(z.enum(["analogies", "exemples", "schemas", "texte"])).max(4),
  minutes: z.union([z.literal(3), z.literal(7), z.literal(12)]).nullable(),
  density: z.enum(["essentiel", "equilibre", "approfondi"]).nullable(),
  example_domain: z.enum(["quotidien", "travail", "sciences", "sans_preference"]).nullable(),
  familiarity: z.enum(["aucune", "bases", "maitrise"]).nullable(),
});
export type PreferencesSnapshot = z.infer<typeof PreferencesSnapshot>;

export const ExplanationObject = z.strictObject({
  schema_version: schemaVersion,
  id,
  knowledge_id: id,
  level: Level,
  goal: Goal,
  /** Approche choisie (absente : générations antérieures à V4). */
  mode: Mode.optional(),
  /** 3 à 5 points clés affichés sous le titre. */
  key_points: z.array(shortText).max(7).optional(),
  /** Source trop pauvre pour un rapport complet : résultat court annoncé comme tel. */
  short_result: z.boolean().optional(),
  preferences_snapshot: PreferencesSnapshot,
  sections: z.array(Section).min(1).max(40),
  glossary: z.array(GlossaryEntry).max(200),
  checks: z.array(ComprehensionCheck).max(20),
  limitations: z.array(mediumText).max(40),
});
export type ExplanationObject = z.infer<typeof ExplanationObject>;

/* ---------- ReportBlueprint ---------- */

export const VISUAL_KINDS = ["timeline", "flow", "comparison_table", "bar_chart", "concept_map", "steps", "illustration", "drawing"] as const;

export const VisualSpec = z.strictObject({
  id,
  kind: z.enum(VISUAL_KINDS),
  purpose: shortText,
  claim_ids: ids(30).min(1),
  evidence_ids: ids(30),
  // Les données sont validées par type de visuel dans le moteur de rendu.
  data: z.record(z.string().max(60), z.unknown()),
  alt_text: mediumText,
  caption: shortText,
  illustrative_only: z.boolean(),
  /** Intentions de composition traduites par le moteur en dispositions adaptatives. */
  size: z.enum(["thumb", "compact", "wide"]).optional(),
  // « wrap » : incrusté dans le texte d'un bloc (le texte l'entoure puis continue dessous).
  placement: z.enum(["center", "before", "after", "margin", "wrap"]).optional(),
});
export type VisualSpec = z.infer<typeof VisualSpec>;

export const BlueprintSection = z.strictObject({
  section_id: id,
  visual_ids: ids(5),
  page_hint: z.number().int().min(1).max(200).nullable(),
});

export const ReportBlueprint = z.strictObject({
  schema_version: schemaVersion,
  id,
  explanation_id: id,
  template_id: TemplateId,
  target_pages: TargetPages,
  title: shortText,
  sections: z.array(BlueprintSection).min(1).max(40),
  visual_specs: z.array(VisualSpec).max(40),
  source_index: ids(4_000),
  layout_warnings: z.array(shortText).max(40),
});
export type ReportBlueprint = z.infer<typeof ReportBlueprint>;

/* ---------- ValidationResult ---------- */

export const ValidationCheck = z.strictObject({
  name: z.string().max(80),
  method: z.enum(["schema", "reference", "quote_match", "number_match", "model_review", "render"]),
  object_ids: ids(100),
  passed: z.boolean(),
  detail: z.string().max(500).nullable(),
});

export const ValidationResult = z.strictObject({
  object_version: z.string().max(80),
  checks: z.array(ValidationCheck).max(500),
  blocking_errors: z.array(z.string().max(500)).max(200),
  warnings: z.array(z.string().max(500)).max(200),
  repair_count: z.number().int().min(0).max(2),
});
export type ValidationResult = z.infer<typeof ValidationResult>;

/* ---------- Exercices (V4) : points de contrôle et bilan de compréhension ---------- */

export const EXERCISE_KINDS = ["single", "multiple", "truefalse", "order", "match", "cloze", "short"] as const;
export const ExerciseKind = z.enum(EXERCISE_KINDS);
export type ExerciseKind = z.infer<typeof ExerciseKind>;

/**
 * Une question : objectif, notion ciblée, références, réponse attendue et correction. Les
 * corrections objectives sont faites par le code ; « short » est évaluée avec une grille.
 */
export const Exercise = z.strictObject({
  id,
  kind: ExerciseKind,
  prompt: mediumText,
  objective: shortText,
  notion: shortText.nullable(),
  section_id: id,
  evidence_ids: ids(10),
  /** single / multiple : propositions et justification de chacune. */
  options: z.array(z.strictObject({ text: shortText, correct: z.boolean(), why: mediumText })).max(6),
  /** truefalse : valeur de l'affirmation. */
  truth: z.boolean().nullable(),
  /** order : éléments dans le bon ordre. */
  items: z.array(shortText).max(8),
  /** match : paires à associer. */
  pairs: z.array(z.strictObject({ left: shortText, right: shortText })).max(6),
  /** cloze : réponses acceptées pour chaque « ___ » du prompt. */
  blanks: z.array(z.array(z.string().trim().min(1).max(80)).min(1).max(5)).max(4),
  /** short : réponse attendue et grille d'évaluation. */
  expected: mediumText.nullable(),
  rubric: z.array(shortText).max(6),
  explanation: mediumText,
});
export type Exercise = z.infer<typeof Exercise>;

export const ExerciseSet = z.strictObject({
  schema_version: schemaVersion,
  checkpoints: z.array(z.strictObject({ section_id: id, exercises: z.array(Exercise).min(1).max(3) })).max(20),
  bilan: z.array(Exercise).max(25),
  /** Source insuffisante pour un bilan complet : annoncé au lecteur. */
  insufficient: z.boolean(),
});
export type ExerciseSet = z.infer<typeof ExerciseSet>;

/** Éléments sourcés imbriqués d'un bloc (liste, étapes, frise, lignes d'un tableau). */
function nested(b: Block): { claim_ids: string[]; evidence_ids: string[] }[] {
  switch (b.type) {
    case "list":
    case "steps":
      return b.items;
    case "timeline":
      return b.events;
    case "comparison":
      return b.rows;
    default:
      return [];
  }
}

/** Toutes les affirmations citées par un bloc (y compris ses éléments imbriqués). */
export function blockClaimIds(b: Block): string[] {
  return [...b.claim_ids, ...nested(b).flatMap((i) => i.claim_ids)];
}

/** Toutes les preuves citées par un bloc (y compris ses éléments imbriqués). */
export function blockEvidenceIds(b: Block): string[] {
  return [...b.evidence_ids, ...nested(b).flatMap((i) => i.evidence_ids)];
}
