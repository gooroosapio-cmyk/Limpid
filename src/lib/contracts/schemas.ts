/**
 * Contrats versionnés du moteur (payload 2, § 5).
 * Tous les objets sont stricts : un champ inattendu est refusé.
 * Les offsets sont exprimés en unités de code UTF-16 dans le texte normalisé figé
 * du segment (unité de String.prototype.slice en JavaScript).
 */
import { z } from "zod";

export const SCHEMA_VERSION = "1.0.0" as const;
const schemaVersion = z.literal(SCHEMA_VERSION);

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

export const TARGET_PAGES = [5, 7, 12] as const;
export const TargetPages = z.union([z.literal(5), z.literal(7), z.literal(12)]);

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
  source_ids: ids(1).min(1), // V1 : une seule source
  concepts: z.array(Concept).max(100),
  claims: z.array(Claim).max(500),
  relations: z.array(Relation).max(300),
  contradictions: z.array(Contradiction).max(50),
  missing_information: z.array(mediumText).max(50),
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

export const Block = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("fact"), ...blockBase }),
  z.strictObject({ type: z.literal("definition"), term: shortText, ...blockBase }),
  z.strictObject({ type: z.literal("analogy"), limit: mediumText, ...blockBase }),
  z.strictObject({ type: z.literal("fictional_example"), ...blockBase }),
  z.strictObject({ type: z.literal("inference"), ...blockBase }),
  z.strictObject({ type: z.literal("caution"), ...blockBase }),
]);
export type Block = z.infer<typeof Block>;

export const Section = z.strictObject({
  id,
  question: shortText,
  takeaway: mediumText,
  blocks: z.array(Block).min(1).max(30),
});

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
  preferences_snapshot: PreferencesSnapshot,
  sections: z.array(Section).min(1).max(20),
  glossary: z.array(GlossaryEntry).max(60),
  checks: z.array(ComprehensionCheck).max(20),
  limitations: z.array(mediumText).max(20),
});
export type ExplanationObject = z.infer<typeof ExplanationObject>;

/* ---------- ReportBlueprint ---------- */

export const VISUAL_KINDS = ["timeline", "flow", "comparison_table", "bar_chart", "concept_map", "steps"] as const;

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
});
export type VisualSpec = z.infer<typeof VisualSpec>;

export const BlueprintSection = z.strictObject({
  section_id: id,
  visual_ids: ids(5),
  page_hint: z.number().int().min(1).max(12).nullable(),
});

export const ReportBlueprint = z.strictObject({
  schema_version: schemaVersion,
  id,
  explanation_id: id,
  template_id: TemplateId,
  target_pages: TargetPages,
  title: shortText,
  sections: z.array(BlueprintSection).min(1).max(20),
  visual_specs: z.array(VisualSpec).max(20),
  source_index: ids(500),
  layout_warnings: z.array(shortText).max(20),
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
