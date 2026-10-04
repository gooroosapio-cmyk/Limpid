/**
 * Pipeline de génération (payload 2, § 2) : compréhension → explication → mise en page.
 * Chaque étape IA produit un brouillon strict, complété et contrôlé côté serveur :
 * offsets calculés par le serveur, identifiants vérifiés, jusqu'à deux réparations.
 * La mise en page est déterministe ; le modèle ne dessine rien.
 */
import { z } from "zod";
import {
  Claim,
  Concept,
  Contradiction,
  GlossaryEntry,
  ComprehensionCheck,
  Relation,
  SCHEMA_VERSION,
  Section,
  TemplateId,
  type Evidence,
  type ExplanationObject,
  type Goal,
  type KnowledgeObject,
  type Level,
  type PreferencesSnapshot,
  type ReportBlueprint,
  type SourceSegment,
  type ValidationResult,
  type VisualSpec,
} from "@/lib/contracts/schemas";
import {
  ValidationCollector,
  validateBlueprint,
  validateEvidence,
  validateExplanation,
  validateKnowledge,
} from "@/lib/contracts/validate";
import { FlowData } from "@/lib/render/visuals";
import { ProviderError, type AIProvider, type StageBudget, type UsageReport } from "./provider";
import { locateQuote } from "./quotes";

export const PROMPT_VERSION = "2026-10-04.1";
const MAX_REPAIRS = 2;

/* ---------- Brouillons demandés au modèle ---------- */

const draftId = z.string().regex(/^[a-z]{1,6}_[A-Za-z0-9_-]{1,64}$/);

export const ComprehensionDraft = z.strictObject({
  evidence: z
    .array(z.strictObject({ id: draftId, segment_id: draftId, quote: z.string().min(3).max(1_000) }))
    .max(500),
  concepts: z.array(Concept).max(100),
  claims: z.array(Claim).max(500),
  relations: z.array(Relation).max(300),
  contradictions: z.array(Contradiction).max(50),
  missing_information: z.array(z.string().trim().min(1).max(2_000)).max(50),
});
export type ComprehensionDraft = z.infer<typeof ComprehensionDraft>;

export const ExplanationDraft = z.strictObject({
  title: z.string().trim().min(1).max(200),
  template_id: TemplateId,
  sections: z.array(Section).min(1).max(20),
  glossary: z.array(GlossaryEntry).max(60),
  checks: z.array(ComprehensionCheck).max(20),
  limitations: z.array(z.string().trim().min(1).max(2_000)).max(20),
  flow: FlowData.nullable(),
});
export type ExplanationDraft = z.infer<typeof ExplanationDraft>;

/* ---------- Consignes (fiables, versionnées) ---------- */

const LEVEL_GUIDE: Record<Level, string> = {
  ultra_simple: "phrases très courtes, vocabulaire courant, un concept à la fois, chaque terme technique expliqué",
  grand_public: "langage clair, termes techniques définis, exemples concrets",
  etudiant: "précis et structuré, vocabulaire du domaine défini une fois, liens entre notions",
  professionnel: "dense et opérationnel, implications pratiques, nuances conservées",
  expert_presse: "registre expert, nuances, limites et incertitudes explicites",
};

const COMPREHENSION_INSTRUCTIONS = `Tu es le moteur d'analyse de Limpid. Tu extrais la connaissance d'une source, sans rien inventer.
Règles :
- Chaque segment est fourni avec son identifiant (seg_…). Une preuve (ev_1, ev_2…) cite un extrait COPIÉ MOT POUR MOT d'un seul segment, sans reformulation ni coupure au milieu d'un mot ; 1 à 3 phrases maximum.
- Une affirmation (clm_1…) reformule fidèlement ce que dit la source, avec ses nuances (« environ », « selon », « peut ») dans qualifiers. support_status = "supported" seulement si ses preuves la soutiennent directement ; sinon "ambiguous" ou "unsupported".
- Tout nombre d'une affirmation va dans numbers, avec source_form = l'écriture exacte du nombre dans la preuve (ex. « 97 % »). Le nombre doit figurer dans une preuve citée par l'affirmation.
- Concepts (cpt_…) : notions importantes, définies par des affirmations existantes. Relations (rel_…) entre concepts ou affirmations existants, justifiées par des affirmations existantes.
- Contradictions (ctr_…) seulement si la source se contredit. missing_information : ce que la source ne dit pas et qu'un lecteur chercherait.
- N'utilise aucune connaissance extérieure à la source. Langue des textes produits : celle de la source.`;

function explanationInstructions(level: Level, goal: Goal, prefs: PreferencesSnapshot, targetPages: number): string {
  const aids = prefs.aids.length ? prefs.aids.join(", ") : "aucune préférence";
  return `Tu es le rédacteur pédagogique de Limpid (méthode Feynman). À partir d'un objet de connaissance validé, rédige une explication en vouvoyant le lecteur.
Profil : niveau « ${level} » (${LEVEL_GUIDE[level]}) ; objectif « ${goal} » ; aides préférées : ${aids} ; domaine d'exemples : ${prefs.example_domain ?? "libre"} ; densité : ${prefs.density ?? "équilibrée"} ; environ ${targetPages} pages.
Règles :
- Sections (sec_1…) : chacune répond à une question du lecteur et donne un takeaway d'une phrase. Blocs (blk_1…, identifiants uniques dans tout le document).
- Types de blocs : "fact" et "definition" = uniquement ce que disent des affirmations "supported", citées dans claim_ids avec leurs evidence_ids. "analogy" = comparaison, avec sa limite dans limit. "fictional_example" = exemple inventé, présenté comme tel. "inference" = déduction de votre part, présentée comme telle. "caution" = limite, incertitude ou affirmation ambiguë.
- N'utilise que les identifiants clm_… et ev_… fournis. Aucun fait nouveau hors des affirmations.
- glossary : termes clés. checks (chk_…) : 1 à 3 questions de compréhension avec points attendus et evidence_ids.
- limitations : ce que le rapport ne couvre pas (couverture partielle, informations manquantes).
- template_id : "comprendre_processus" pour une suite d'étapes, "comparer_options" pour une comparaison, "expliquer_document" pour un document précis, sinon "comprendre_sujet".
- flow : si la source décrit un processus en étapes, 2 à 8 étapes (label ≤ 40 caractères, claim_id existant) ; sinon null.
- Langue : celle des affirmations.`;
}

/* ---------- Exécution ---------- */

export interface GenerationInput {
  sourceId: string;
  segments: SourceSegment[];
  level: Level;
  goal: Goal;
  targetPages: 5 | 7 | 12;
  preferences: PreferencesSnapshot;
  signal: AbortSignal;
  budgets: { comprehension: StageBudget; explanation: StageBudget };
  /** Appelé après chaque appel au fournisseur (journal de consommation). */
  onUsage?: (stage: string, attempt: number, usage: UsageReport) => void | Promise<void>;
  /** Appelé au début de chaque étape (progression affichée, heartbeat du worker). */
  onStage?: (stage: "comprehension" | "explication" | "verification") => void | Promise<void>;
}

export interface GenerationOutput {
  status: "validated" | "incomplete";
  knowledge: KnowledgeObject;
  evidence: Evidence[];
  explanation: ExplanationObject;
  blueprint: ReportBlueprint;
  validation: { knowledge: ValidationResult; explanation: ValidationResult };
}

function segmentsPayload(segments: SourceSegment[]): string {
  return segments.map((s) => `[${s.id}]\n${s.text}`).join("\n\n");
}

/** Transforme les citations du brouillon en preuves aux offsets exacts ; renvoie aussi les échecs. */
export function resolveEvidence(draft: ComprehensionDraft, segments: Map<string, SourceSegment>) {
  const evidence: Evidence[] = [];
  const errors: string[] = [];
  for (const e of draft.evidence) {
    const seg = segments.get(e.segment_id);
    if (!seg) {
      errors.push(`${e.id}: segment inconnu ${e.segment_id}`);
      continue;
    }
    const loc = locateQuote(seg.text, e.quote);
    if (!loc) {
      errors.push(`${e.id}: citation introuvable mot pour mot dans ${e.segment_id}`);
      continue;
    }
    evidence.push({ id: e.id, segment_id: seg.id, start_offset: loc.start, end_offset: loc.end, quote: loc.quote });
  }
  return { evidence, errors };
}

async function callWithRetry<T extends z.ZodType>(
  provider: AIProvider,
  input: GenerationInput,
  stage: string,
  attemptBase: number,
  req: { schema: T; instructions: string; data: { label: string; text: string }[]; budget: StageBudget },
): Promise<z.infer<T>> {
  // Les erreurs passagères (surcharge, quota) sont retentées avec attente ; les autres remontent.
  const delays = [5_000, 20_000, 40_000];
  for (let i = 0; ; i++) {
    try {
      const res = await provider.generateStructured({
        stage,
        schema: req.schema,
        trustedInstructions: req.instructions,
        untrustedData: req.data,
        budget: req.budget,
        signal: input.signal,
      });
      await input.onUsage?.(stage, attemptBase + i, res.usage);
      return res.value;
    } catch (e) {
      if (e instanceof ProviderError && e.usage) await input.onUsage?.(stage, attemptBase + i, e.usage);
      const transient = e instanceof ProviderError && (e.code === "unavailable" || e.code === "rate_limited");
      if (!transient || i >= delays.length) throw e;
      await new Promise((r) => setTimeout(r, delays[i]));
    }
  }
}

async function comprehension(provider: AIProvider, input: GenerationInput, segments: Map<string, SourceSegment>) {
  const sourceText = segmentsPayload(input.segments);
  let draft: ComprehensionDraft | null = null;
  let feedback: string[] = [];
  for (let repair = 0; repair <= MAX_REPAIRS; repair++) {
    const data = [{ label: "source", text: sourceText }];
    if (draft) {
      data.push({ label: "brouillon precedent", text: JSON.stringify(draft) });
      data.push({ label: "erreurs a corriger", text: feedback.join("\n") });
    }
    const instructions: string = draft
      ? `${COMPREHENSION_INSTRUCTIONS}\nUn brouillon précédent contenait des erreurs (listées). Renvoie un objet complet corrigé : recopie les citations exactement depuis la source, ou supprime les preuves et affirmations impossibles à justifier.`
      : COMPREHENSION_INSTRUCTIONS;
    draft = await callWithRetry(provider, input, "comprehension", repair * 10, {
      schema: ComprehensionDraft,
      instructions,
      data,
      budget: input.budgets.comprehension,
    });

    const { evidence, errors } = resolveEvidence(draft, segments);
    const knowledge = buildKnowledge(input, draft);
    const v = new ValidationCollector();
    for (const err of errors) v.fail("evidence_quote_located", "quote_match", [err.split(":")[0]!], err);
    validateEvidence(evidence, segments, v);
    validateKnowledge(knowledge, evidence, v);
    if (v.blocking.length === 0 || repair === MAX_REPAIRS) {
      return { knowledge, evidence, validation: v.result(`${knowledge.id}@${SCHEMA_VERSION}`, repair) };
    }
    feedback = v.blocking;
  }
  throw new Error("inaccessible");
}

function buildKnowledge(input: GenerationInput, draft: ComprehensionDraft): KnowledgeObject {
  return {
    schema_version: SCHEMA_VERSION,
    id: `ko_${input.segments[0]!.source_version.slice(0, 16)}`,
    source_ids: [input.sourceId],
    concepts: draft.concepts,
    claims: draft.claims,
    relations: draft.relations,
    contradictions: draft.contradictions,
    missing_information: draft.missing_information,
    // La couverture est établie par le serveur, jamais déclarée par le modèle.
    coverage: {
      segments_total: input.segments.length,
      segments_processed: input.segments.length,
      unreadable_locators: [],
      partial: false,
    },
  };
}

function knowledgePayload(ko: KnowledgeObject, evidence: Evidence[]): string {
  // Seules les affirmations et preuves validées sont transmises à l'étape d'explication.
  return JSON.stringify({
    claims: ko.claims,
    concepts: ko.concepts,
    relations: ko.relations,
    contradictions: ko.contradictions,
    missing_information: ko.missing_information,
    evidence: evidence.map((e) => ({ id: e.id, quote: e.quote })),
  });
}

function buildExplanation(input: GenerationInput, ko: KnowledgeObject, draft: ExplanationDraft): ExplanationObject {
  return {
    schema_version: SCHEMA_VERSION,
    id: `exp_${ko.id.slice(3)}`,
    knowledge_id: ko.id,
    level: input.level,
    goal: input.goal,
    preferences_snapshot: input.preferences,
    sections: draft.sections,
    glossary: draft.glossary,
    checks: draft.checks,
    limitations: draft.limitations,
  };
}

/** Mise en page déterministe : ordre des sections, visuel de flux validé, index des sources. */
export function buildBlueprint(
  draft: ExplanationDraft,
  ex: ExplanationObject,
  ko: KnowledgeObject,
  evidence: Evidence[],
  targetPages: 5 | 7 | 12,
): ReportBlueprint {
  const claims = new Map(ko.claims.map((c) => [c.id, c]));
  const visuals: VisualSpec[] = [];
  const warnings: string[] = [];
  let flowSection: string | null = null;

  if (draft.flow) {
    const steps = draft.flow.steps.filter((s) => claims.get(s.claim_id)?.support_status === "supported");
    if (steps.length >= 2) {
      const claimIds = [...new Set(steps.map((s) => s.claim_id))];
      const evIds = [...new Set(claimIds.flatMap((cid) => claims.get(cid)!.evidence_ids))].slice(0, 30);
      const labels = steps.map((s) => s.label);
      visuals.push({
        id: "vis_flow",
        kind: "flow",
        purpose: "Montrer l'enchaînement des étapes",
        claim_ids: claimIds.slice(0, 30),
        evidence_ids: evIds,
        data: { steps, cyclic: draft.flow.cyclic },
        alt_text: `Schéma${draft.flow.cyclic ? " en boucle" : ""} : ${labels.join(", puis ")}.`.slice(0, 2_000),
        caption: "Les étapes, dans l'ordre",
        illustrative_only: false,
      });
      // Le schéma accompagne la première section qui cite l'une de ses affirmations.
      flowSection =
        ex.sections.find((s) => s.blocks.some((b) => b.claim_ids.some((c) => claimIds.includes(c))))?.id ??
        ex.sections[0]!.id;
    } else {
      warnings.push("Schéma de flux écarté : étapes insuffisamment sourcées.");
    }
  }

  const perPage = Math.max(1, Math.ceil(ex.sections.length / targetPages));
  const used = new Set(ex.sections.flatMap((s) => s.blocks.flatMap((b) => b.evidence_ids)));
  return {
    schema_version: SCHEMA_VERSION,
    id: `bp_${ex.id.slice(4)}`,
    explanation_id: ex.id,
    template_id: draft.template_id,
    target_pages: targetPages,
    title: draft.title.slice(0, 500),
    sections: ex.sections.map((s, i) => ({
      section_id: s.id,
      visual_ids: s.id === flowSection ? ["vis_flow"] : [],
      page_hint: Math.min(12, Math.floor(i / perPage) + 1),
    })),
    visual_specs: visuals,
    source_index: evidence.filter((e) => used.has(e.id)).map((e) => e.id),
    layout_warnings: warnings,
  };
}

async function explanation(
  provider: AIProvider,
  input: GenerationInput,
  ko: KnowledgeObject,
  evidence: Evidence[],
  variation?: { instructions: string; data: { label: string; text: string }[] },
) {
  const base = explanationInstructions(input.level, input.goal, input.preferences, input.targetPages);
  const instructions = variation ? `${base}\n${variation.instructions}` : base;
  const kp = knowledgePayload(ko, evidence);
  const evidenceIds = new Set(evidence.map((e) => e.id));
  let draft: ExplanationDraft | null = null;
  let feedback: string[] = [];
  for (let repair = 0; repair <= MAX_REPAIRS; repair++) {
    const data = [{ label: "connaissance validee", text: kp }, ...(variation?.data ?? [])];
    if (draft) {
      data.push({ label: "brouillon precedent", text: JSON.stringify(draft) });
      data.push({ label: "erreurs a corriger", text: feedback.join("\n") });
    }
    draft = await callWithRetry(provider, input, "explication", repair * 10, {
      schema: ExplanationDraft,
      instructions: draft ? `${instructions}\nCorrige les erreurs listées et renvoie l'objet complet.` : instructions,
      data,
      budget: input.budgets.explanation,
    });
    const ex = buildExplanation(input, ko, draft);
    const bp = buildBlueprint(draft, ex, ko, evidence, input.targetPages);
    const v = new ValidationCollector();
    validateExplanation(ex, ko, evidenceIds, v);
    validateBlueprint(bp, ex, ko, evidenceIds, v);
    if (v.blocking.length === 0 || repair === MAX_REPAIRS) {
      return { explanation: ex, blueprint: bp, validation: v.result(`${ex.id}@${SCHEMA_VERSION}`, repair) };
    }
    feedback = v.blocking;
  }
  throw new Error("inaccessible");
}

export async function generateReport(provider: AIProvider, input: GenerationInput): Promise<GenerationOutput> {
  if (input.segments.length === 0) throw new Error("Aucun segment à analyser.");
  const segments = new Map(input.segments.map((s) => [s.id, s]));
  await input.onStage?.("comprehension");
  const comp = await comprehension(provider, input, segments);
  await input.onStage?.("explication");
  // Seules les preuves localisées et cohérentes passent à la suite.
  const exp = await explanation(provider, input, comp.knowledge, comp.evidence);
  await input.onStage?.("verification");
  const ok = comp.validation.blocking_errors.length === 0 && exp.validation.blocking_errors.length === 0;
  return {
    status: ok ? "validated" : "incomplete",
    knowledge: comp.knowledge,
    evidence: comp.evidence,
    explanation: exp.explanation,
    blueprint: exp.blueprint,
    validation: { knowledge: comp.validation, explanation: exp.validation },
  };
}

/* ---------- Nouvelle version d'une explication ---------- */

export type Variation = "simpler" | "other_example";

const VARIATION_INSTRUCTIONS: Record<Variation, string> = {
  simpler: `Nouvelle version PLUS SIMPLE que la version précédente (fournie) : phrases plus courtes, moins de termes techniques (chacun défini), une idée par phrase, une analogie quand elle aide. Même contenu factuel, mêmes affirmations sources ; ne retire pas d'information essentielle.`,
  other_example: `Nouvelle version avec D'AUTRES EXEMPLES : remplace chaque analogie et chaque exemple imaginé de la version précédente (fournie) par un nouveau, clairement différent (autre situation, autre domaine). Garde les mêmes questions de sections et le même niveau ; les blocs factuels peuvent rester identiques.`,
};

/** Résumé de la version précédente transmis au modèle : questions, analogies, exemples. */
function previousVersionPayload(prev: ExplanationObject): string {
  return JSON.stringify(
    prev.sections.map((s) => ({
      question: s.question,
      analogies: s.blocks.filter((b) => b.type === "analogy").map((b) => b.text),
      exemples: s.blocks.filter((b) => b.type === "fictional_example").map((b) => b.text),
      faits: s.blocks.filter((b) => b.type === "fact" || b.type === "definition").map((b) => b.text),
    })),
  );
}

/**
 * Réécrit l'explication à partir de la connaissance déjà validée (aucune nouvelle lecture
 * de la source) : seule l'étape d'explication est rejouée, avec les mêmes contrôles.
 */
export async function regenerateExplanation(
  provider: AIProvider,
  input: Omit<GenerationInput, "segments" | "sourceId">,
  ko: KnowledgeObject,
  evidence: Evidence[],
  previous: ExplanationObject,
  variation: Variation,
) {
  const full: GenerationInput = { ...input, sourceId: ko.source_ids[0]!, segments: [] };
  await input.onStage?.("explication");
  const exp = await explanation(provider, full, ko, evidence, {
    instructions: VARIATION_INSTRUCTIONS[variation],
    data: [{ label: "version precedente", text: previousVersionPayload(previous) }],
  });
  await input.onStage?.("verification");
  return { ...exp, status: exp.validation.blocking_errors.length === 0 ? ("validated" as const) : ("incomplete" as const) };
}

/** Niveau de la version « plus simple » : un cran plus simple, jusqu'à « ultra simple ». */
export function simplerLevel(level: Level): Level {
  const order: Level[] = ["ultra_simple", "grand_public", "etudiant", "professionnel", "expert_presse"];
  return order[Math.max(0, order.indexOf(level) - 1)]!;
}
