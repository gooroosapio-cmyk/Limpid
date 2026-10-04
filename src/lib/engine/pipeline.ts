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
  SupportStatus,
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
  type VisualMode,
  type VisualSpec,
} from "@/lib/contracts/schemas";
import {
  ValidationCollector,
  validateBlueprint,
  validateEvidence,
  validateExplanation,
  validateKnowledge,
} from "@/lib/contracts/validate";
import { ComparisonData, FlowData, safeImageQuery, type ChartData } from "@/lib/render/visuals";
import { ProviderError, type AIProvider, type StageBudget, type UsageReport } from "./provider";
import { caveatGaps, droppedCaveatClaims } from "./coverage";
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
  // Schémas et illustrations facultatifs : validés et dessinés par le moteur, jamais par le modèle.
  chart: z
    .strictObject({
      title: z.string().trim().min(1).max(80),
      bars: z
        .array(z.strictObject({ label: z.string().trim().min(1).max(40), claim_id: draftId, source_form: z.string().min(1).max(120) }))
        .min(2)
        .max(6),
    })
    .nullable()
    .optional(),
  comparison: ComparisonData.nullable().optional(),
  illustrations: z
    .array(
      z.strictObject({
        section_id: draftId,
        query: z.string().trim().min(2).max(60),
        subject: z.string().trim().min(1).max(120),
        alt_text: z.string().trim().min(1).max(300),
      }),
    )
    .max(2)
    .optional(),
});
export type ExplanationDraft = z.infer<typeof ExplanationDraft>;

/* ---------- Consignes (fiables, versionnées) ---------- */

/** Règles éditoriales par niveau (cahier V2, § 6) : le niveau change l'effort d'explication, jamais les réserves. */
const LEVEL_GUIDE: Record<Level, string> = {
  ultra_simple: "une idée à la fois ; mots courants ; tout terme nouveau défini tout de suite ; exemple concret ; analogie si utile",
  grand_public: "définitions accessibles ; liens essentiels entre les idées ; exemple et limites en langage courant",
  etudiant: "prérequis rappelés ; définitions précises ; relations entre notions ; glossaire et questions de vérification",
  professionnel: "fonctionnement ; conséquences pratiques ; conditions d'application ; arbitrages",
  expert_presse: "texte dense ; hypothèses et chiffres conservés ; synthèse sans étapes élémentaires inutiles",
};

/** Séquences de sections par template (cahier V2, § 8) : le fond reste stable, l'ordre suit l'intention. */
const TEMPLATE_GUIDE: Record<z.infer<typeof TemplateId>, string> = {
  comprendre_sujet: "l'essentiel → les notions → leurs relations → un exemple → les nuances → récapitulatif",
  expliquer_document: "l'objet du document → ses affirmations → les éléments clés → leur portée → ses limites",
  comprendre_processus: "le but → les entrées → les étapes → les dépendances → les points de vigilance → le résultat",
  comparer_options: "la question → des critères identiques pour chaque option → la comparaison → les compromis → les données manquantes",
};

const COMPREHENSION_INSTRUCTIONS = `Tu es le moteur d'analyse de Limpid. Tu extrais la connaissance d'une source, sans rien inventer.
Règles :
- Chaque segment est fourni avec son identifiant (seg_…). Une preuve (ev_1, ev_2…) cite un extrait COPIÉ MOT POUR MOT d'un seul segment, sans reformulation ni coupure au milieu d'un mot ; 1 à 3 phrases maximum.
- Une affirmation (clm_1…) reformule fidèlement ce que dit la source, avec ses nuances (« environ », « selon », « peut ») dans qualifiers. support_status = "supported" seulement si ses preuves la soutiennent directement ; "partial" si elles n'en soutiennent qu'une partie ; "ambiguous", "unsupported" ou "contradicted" sinon.
- Tout nombre d'une affirmation va dans numbers, avec source_form = l'écriture exacte du nombre dans la preuve (ex. « 97 % »). Le nombre doit figurer dans une preuve citée par l'affirmation.
- Concepts (cpt_…) : notions importantes, définies par des affirmations existantes. Relations (rel_…) entre concepts ou affirmations existants, justifiées par des affirmations existantes.
- Contradictions (ctr_…) seulement si la source se contredit. missing_information : ce que la source ne dit pas et qu'un lecteur chercherait.
- N'utilise aucune connaissance extérieure à la source. Langue des textes produits : celle de la source.`;

function explanationInstructions(
  level: Level,
  goal: Goal,
  prefs: PreferencesSnapshot,
  targetPages: number,
  template: z.infer<typeof TemplateId> | null = null,
): string {
  const aids = prefs.aids.length ? prefs.aids.join(", ") : "aucune préférence";
  const templates = Object.entries(TEMPLATE_GUIDE)
    .map(([id, seq]) => `  · ${id} : ${seq}`)
    .join("\n");
  return `Tu es le rédacteur pédagogique de Limpid (méthode Feynman, sans infantiliser). À partir d'un objet de connaissance validé, rédige une explication en vouvoyant le lecteur, ton impersonnel, adulte et respectueux.
Profil : niveau « ${level} » (${LEVEL_GUIDE[level]}) ; objectif « ${goal} » ; aides préférées : ${aids} ; domaine d'exemples : ${prefs.example_domain ?? "neutre"} ; densité : ${prefs.density ?? "équilibrée"} ; environ ${targetPages} pages, sources comprises.
Règles :
- Le niveau change l'effort d'explication, jamais le sens : garde toutes les réserves, conditions et nombres qui changent la conclusion.
- Sections (sec_1…) : chacune répond à une question du lecteur et donne un takeaway d'une phrase. Blocs (blk_1…, identifiants uniques dans tout le document).
- Types de blocs : "fact" et "definition" = uniquement des affirmations "supported", citées dans claim_ids avec leurs evidence_ids. Une affirmation "partial" ou "ambiguous" va dans un bloc "caution" (ou une formulation explicitement prudente) ; une affirmation "contradicted" est exposée dans un bloc "caution" qui montre le désaccord ; une affirmation "unsupported" n'est pas utilisée.
- "analogy" : idée cible, exemple familier, correspondance, puis sa limite dans limit (ce que la comparaison n'implique pas). "fictional_example" = exemple inventé, présenté comme tel. "inference" = déduction, présentée comme telle. "caution" = limite, incertitude ou réserve.
- N'utilise que les identifiants clm_… et ev_… fournis. Aucun fait nouveau hors des affirmations.
- glossary : termes clés. checks (chk_…) : 1 à 3 questions qui demandent de reformuler le mécanisme ou de l'appliquer (pas seulement de répéter un chiffre), avec points attendus et evidence_ids.
- limitations : ce que le rapport ne couvre pas (couverture partielle, informations manquantes, limites du document).
- template_id ${template ? `: "${template}" (imposé par le lecteur)` : "au choix"}, et l'ordre des sections suit sa séquence :
${templates}
  Sans indication : "comprendre_processus" pour une suite d'étapes, "comparer_options" pour une comparaison, "expliquer_document" pour un document précis, sinon "comprendre_sujet".
- Si la source est courte, fais moins de sections plutôt que d'ajouter des faits pour remplir.
- flow : si la source décrit un processus en étapes, 2 à 8 étapes (label ≤ 40 caractères, claim_id existant) ; sinon null.
- chart : seulement si au moins 2 valeurs comparables de même unité figurent dans des affirmations "supported" : une barre par valeur (label court, claim_id, source_form = l'écriture exacte du nombre dans l'affirmation) ; sinon null.
- comparison : seulement si la source compare des options : critères identiques pour chaque option, une cellule par critère (texte ≤ 80 caractères et claim_id "supported", ou text et claim_id null si la source ne dit rien) ; sinon null.
- illustrations : 0 à 2 idées d'illustration générique utiles à la compréhension (section_id, query = 2 à 5 mots-clés EN ANGLAIS décrivant une scène ou un objet courant, sans nom propre, sans chiffre, sans donnée du document ; subject = sujet en français ; alt_text). Aucune illustration ne porte un fait.
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
  /** Vérification indépendante des affirmations contre leurs extraits (1 appel rapide). */
  verifyClaims?: boolean;
  /** Template imposé par le lecteur (sinon choisi par le rédacteur). */
  template?: z.infer<typeof TemplateId> | null;
  /** Visuels permis : « aucun » = texte seul, « schemas » = sans illustration. */
  visualMode?: VisualMode;
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

/** Corrections demandées au modèle quand sa réponse ne respecte pas le schéma JSON. */
const MAX_SCHEMA_FIXES = 2;

async function callWithRetry<T extends z.ZodType>(
  provider: AIProvider,
  input: GenerationInput,
  stage: string,
  attemptBase: number,
  req: { schema: T; instructions: string; data: { label: string; text: string }[]; budget: StageBudget },
): Promise<z.infer<T>> {
  // Erreurs passagères (surcharge, quota par minute) : nouvel essai après attente.
  // Réponse hors schéma : nouvel essai avec la liste des écarts (chemins et règles seulement).
  const delays = [5_000, 20_000, 40_000];
  let waits = 0;
  let fixes = 0;
  let schemaFeedback: string[] = [];
  for (let i = 0; ; i++) {
    try {
      const res = await provider.generateStructured({
        stage,
        schema: req.schema,
        trustedInstructions: schemaFeedback.length
          ? `${req.instructions}\nTa réponse précédente ne respectait pas le schéma JSON demandé. Écarts :\n- ${schemaFeedback.join("\n- ")}\nRenvoie un objet complet et conforme : identifiants au format demandé, champs obligatoires présents, aucun champ en plus.`
          : req.instructions,
        untrustedData: req.data,
        budget: req.budget,
        signal: input.signal,
      });
      await input.onUsage?.(stage, attemptBase + i, res.usage);
      return res.value;
    } catch (e) {
      if (e instanceof ProviderError && e.usage) await input.onUsage?.(stage, attemptBase + i, e.usage);
      if (e instanceof ProviderError && e.code === "schema_mismatch" && fixes < MAX_SCHEMA_FIXES) {
        fixes++;
        schemaFeedback = e.issues.length ? e.issues : ["structure générale invalide"];
        continue;
      }
      const transient = e instanceof ProviderError && (e.code === "unavailable" || e.code === "rate_limited");
      if (!transient || waits >= delays.length) throw e;
      await new Promise((r) => setTimeout(r, delays[waits++]));
    }
  }
}

async function comprehension(provider: AIProvider, input: GenerationInput, segments: Map<string, SourceSegment>) {
  const sourceText = segmentsPayload(input.segments);
  let draft: ComprehensionDraft | null = null;
  let feedback: string[] = [];
  // Une seule demande de correction pour la couverture des réserves (coût borné).
  let coverageAsked = false;
  for (let repair = 0; repair <= MAX_REPAIRS; repair++) {
    const data = [{ label: "source", text: sourceText }];
    if (draft) {
      data.push({ label: "brouillon precedent", text: JSON.stringify(draft) });
      data.push({ label: "erreurs a corriger", text: feedback.join("\n") });
    }
    const instructions: string = draft
      ? `${COMPREHENSION_INSTRUCTIONS}\nUn brouillon précédent contenait des erreurs ou des oublis (listés). Renvoie un objet complet corrigé : recopie les citations exactement depuis la source, supprime les preuves et affirmations impossibles à justifier, et reprends les réserves signalées.`
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
    const gaps = caveatGaps(input.segments, evidence);
    const gapLines = gaps.map(
      (g) => `${g.segment_id}: réserve ou limite non reprise — « ${g.sentence} ». Ajoute l'affirmation correspondante, avec ses qualifiers et une preuve copiée mot pour mot ; une limite du document est aussi une affirmation sourcée (ex. « Le document ne traite pas de … »).`,
    );
    const askCoverage = gaps.length > 0 && !coverageAsked && repair < MAX_REPAIRS;
    if ((v.blocking.length === 0 && !askCoverage) || repair === MAX_REPAIRS) {
      for (const g of gaps) v.fail("caveat_covered", "reference", [g.segment_id], `réserve non reprise : « ${g.sentence.slice(0, 120)} »`, false);
      if (gaps.length === 0) v.pass("caveat_covered", "reference", []);
      return { knowledge, evidence, validation: v.result(`${knowledge.id}@${SCHEMA_VERSION}`, repair) };
    }
    if (askCoverage) coverageAsked = true;
    feedback = [...v.blocking, ...(askCoverage ? gapLines : [])];
  }
  throw new Error("inaccessible");
}

/* ---------- Vérification indépendante (cahier V2, § 5) ---------- */

export const VerificationDraft = z.strictObject({
  verdicts: z
    .array(
      z.strictObject({
        claim_id: draftId,
        status: z.enum(["supported", "partial", "unsupported", "contradicted"]),
        reason: z.string().trim().max(300),
      }),
    )
    .max(500),
});
export type VerificationDraft = z.infer<typeof VerificationDraft>;

const VERIFY_INSTRUCTIONS = `Tu es le vérificateur de Limpid. Pour chaque affirmation, tu juges UNIQUEMENT d'après les extraits de la source qui l'accompagnent, sans connaissance extérieure.
- "supported" : les extraits disent exactement cela, nombres, unités, périodes et nuances compris.
- "partial" : les extraits soutiennent une partie seulement, ou l'affirmation généralise, perd une condition ou une réserve.
- "unsupported" : les extraits ne permettent pas de l'affirmer.
- "contradicted" : les extraits disent le contraire, ou un nombre, une date ou une unité diffère.
Un verdict par affirmation, avec une raison courte et factuelle (pas de raisonnement détaillé).`;

/** Ordre de prudence : le statut final est le plus prudent des deux jugements. */
const CAUTION: Record<SupportStatus, number> = { supported: 0, partial: 1, ambiguous: 2, unsupported: 3, contradicted: 4 };

export function mostCautious(a: SupportStatus, b: SupportStatus): SupportStatus {
  return CAUTION[a] >= CAUTION[b] ? a : b;
}

function verificationPayload(ko: KnowledgeObject, evidence: Evidence[], segments: Map<string, SourceSegment>): string {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  return JSON.stringify(
    ko.claims.map((c) => ({
      claim_id: c.id,
      statement: c.statement,
      qualifiers: c.qualifiers,
      numbers: c.numbers.map((n) => n.source_form),
      extraits: c.evidence_ids.flatMap((id) => {
        const e = byId.get(id);
        const seg = e ? segments.get(e.segment_id) : undefined;
        if (!e || !seg) return [];
        // Un peu de contexte autour de l'extrait, pour juger les conditions et réserves voisines.
        const before = seg.text.slice(Math.max(0, e.start_offset - 160), e.start_offset);
        const after = seg.text.slice(e.end_offset, e.end_offset + 160);
        return [`…${before}[[${e.quote}]]${after}…`];
      }),
    })),
  );
}

/**
 * Confronte chaque affirmation à ses extraits et abaisse son statut si nécessaire (jamais
 * l'inverse). Les écarts sont consignés ; une affirmation sans verdict garde son statut.
 */
async function verifyClaims(
  provider: AIProvider,
  input: GenerationInput,
  ko: KnowledgeObject,
  evidence: Evidence[],
  segments: Map<string, SourceSegment>,
  v: ValidationCollector,
): Promise<KnowledgeObject> {
  if (ko.claims.length === 0) return ko;
  const draft = await callWithRetry(provider, input, "verification", 0, {
    schema: VerificationDraft,
    instructions: VERIFY_INSTRUCTIONS,
    data: [{ label: "affirmations et extraits", text: verificationPayload(ko, evidence, segments) }],
    budget: input.budgets.comprehension,
  });
  const verdicts = new Map(draft.verdicts.map((x) => [x.claim_id, x]));
  const claims = ko.claims.map((c) => {
    const verdict = verdicts.get(c.id);
    if (!verdict) {
      v.fail("claim_verified", "model_review", [c.id], "affirmation sans verdict du vérificateur", false);
      return c;
    }
    const status = mostCautious(c.support_status, verdict.status);
    if (status !== c.support_status) {
      v.fail("claim_verified", "model_review", [c.id], `${c.support_status} → ${status} : ${verdict.reason}`.slice(0, 500), false);
    } else {
      v.pass("claim_verified", "model_review", [c.id]);
    }
    return { ...c, support_status: status };
  });
  return { ...ko, claims };
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

/** Mise en page déterministe : ordre des sections, schémas validés, illustrations, index des sources. */
export function buildBlueprint(
  draft: ExplanationDraft,
  ex: ExplanationObject,
  ko: KnowledgeObject,
  evidence: Evidence[],
  targetPages: 5 | 7 | 12,
  visualMode: VisualMode = "auto",
): ReportBlueprint {
  const claims = new Map(ko.claims.map((c) => [c.id, c]));
  const supported = (id: string | null | undefined) => !!id && claims.get(id)?.support_status === "supported";
  const visuals: VisualSpec[] = [];
  const placed = new Map<string, string[]>();
  const warnings: string[] = [];
  const evidenceOf = (claimIds: string[]) => [...new Set(claimIds.flatMap((cid) => claims.get(cid)?.evidence_ids ?? []))].slice(0, 30);
  // Un visuel accompagne la première section qui cite l'une de ses affirmations.
  const place = (visualId: string, claimIds: string[], sectionId?: string) => {
    const target =
      sectionId ??
      ex.sections.find((x) => x.blocks.some((b) => b.claim_ids.some((c) => claimIds.includes(c))))?.id ??
      ex.sections[0]!.id;
    placed.set(target, [...(placed.get(target) ?? []), visualId].slice(0, 5));
  };

  if (draft.flow && visualMode !== "aucun") {
    const steps = draft.flow.steps.filter((x) => supported(x.claim_id));
    if (steps.length >= 2) {
      const claimIds = [...new Set(steps.map((x) => x.claim_id))].slice(0, 30);
      const labels = steps.map((x) => x.label);
      visuals.push({
        id: "vis_flow",
        kind: "flow",
        purpose: "Montrer l'enchaînement des étapes",
        claim_ids: claimIds,
        evidence_ids: evidenceOf(claimIds),
        data: { steps, cyclic: draft.flow.cyclic },
        alt_text: `Schéma${draft.flow.cyclic ? " en boucle" : ""} : ${labels.join(", puis ")}.`.slice(0, 2_000),
        caption: "Les étapes, dans l'ordre",
        illustrative_only: false,
      });
      place("vis_flow", claimIds);
    } else {
      warnings.push("Schéma de flux écarté : étapes insuffisamment sourcées.");
    }
  }

  if (draft.chart && visualMode !== "aucun") {
    // Chaque valeur est reprise des nombres validés de l'affirmation : le modèle ne fournit que le repère.
    const norm = (t: string) => t.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
    const bars: ChartData["bars"] = [];
    const units = new Set<string>();
    for (const b of draft.chart.bars) {
      if (!supported(b.claim_id)) continue;
      const n = claims.get(b.claim_id)!.numbers.find((x) => norm(x.source_form) === norm(b.source_form));
      if (!n) continue;
      bars.push({ label: b.label, value: n.value, source_form: n.source_form, claim_id: b.claim_id });
      units.add(n.unit ?? "");
    }
    if (bars.length >= 2 && units.size === 1) {
      const claimIds = [...new Set(bars.map((x) => x.claim_id))].slice(0, 30);
      visuals.push({
        id: "vis_chart",
        kind: "bar_chart",
        purpose: "Comparer des valeurs de la source",
        claim_ids: claimIds,
        evidence_ids: evidenceOf(claimIds),
        data: { unit: [...units][0] || null, bars },
        alt_text: `Graphique en barres. ${bars.map((x) => `${x.label} : ${x.source_form}`).join(" ; ")}.`.slice(0, 2_000),
        caption: draft.chart.title,
        illustrative_only: false,
      });
      place("vis_chart", claimIds);
    } else {
      warnings.push("Graphique écarté : valeurs absentes des affirmations soutenues ou unités différentes.");
    }
  }

  if (draft.comparison && visualMode !== "aucun") {
    const c = draft.comparison;
    // Une cellule sans affirmation soutenue n'affiche aucun contenu du modèle.
    const options = c.options.map((o) => ({
      name: o.name,
      cells: c.criteria.map((_, i) => {
        const cell = o.cells[i];
        return cell && cell.text && supported(cell.claim_id) ? { text: cell.text, claim_id: cell.claim_id } : { text: null, claim_id: null };
      }),
    }));
    const claimIds = [...new Set(options.flatMap((o) => o.cells.flatMap((x) => (x.claim_id ? [x.claim_id] : []))))].slice(0, 30);
    if (claimIds.length >= 2) {
      visuals.push({
        id: "vis_compare",
        kind: "comparison_table",
        purpose: "Comparer les options sur des critères identiques",
        claim_ids: claimIds,
        evidence_ids: evidenceOf(claimIds),
        data: { criteria: c.criteria, options },
        alt_text: options
          .map((o) => `${o.name} : ${c.criteria.map((k, i) => `${k} — ${o.cells[i]!.text ?? "non précisé"}`).join(", ")}`)
          .join(". ")
          .slice(0, 2_000),
        caption: "Comparaison sur les mêmes critères",
        illustrative_only: false,
      });
      place("vis_compare", claimIds);
    } else {
      warnings.push("Tableau comparatif écarté : cellules insuffisamment sourcées.");
    }
  }

  if (visualMode !== "aucun" && visualMode !== "schemas") {
    let n = 0;
    for (const idea of draft.illustrations ?? []) {
      const sec = ex.sections.find((x) => x.id === idea.section_id);
      const query = safeImageQuery(idea.query);
      const claimIds = sec ? [...new Set(sec.blocks.flatMap((b) => b.claim_ids))].filter(supported).slice(0, 5) : [];
      if (!sec || !query || claimIds.length === 0 || n >= 2) continue;
      const id = `vis_ill_${++n}`;
      visuals.push({
        id,
        kind: "illustration",
        purpose: "Illustrer une idée (sans valeur de preuve)",
        claim_ids: claimIds,
        evidence_ids: [],
        data: { query, subject: idea.subject, asset_id: null },
        alt_text: idea.alt_text,
        caption: idea.subject,
        illustrative_only: true,
      });
      place(id, claimIds, sec.id);
    }
  }

  const perPage = Math.max(1, Math.ceil(ex.sections.length / targetPages));
  const used = new Set(ex.sections.flatMap((x) => x.blocks.flatMap((b) => b.evidence_ids)));
  return {
    schema_version: SCHEMA_VERSION,
    id: `bp_${ex.id.slice(4)}`,
    explanation_id: ex.id,
    template_id: draft.template_id,
    target_pages: targetPages,
    title: draft.title.slice(0, 500),
    sections: ex.sections.map((x, i) => ({
      section_id: x.id,
      visual_ids: placed.get(x.id) ?? [],
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
  const base = explanationInstructions(input.level, input.goal, input.preferences, input.targetPages, input.template ?? null);
  const instructions = variation ? `${base}\n${variation.instructions}` : base;
  const kp = knowledgePayload(ko, evidence);
  const evidenceIds = new Set(evidence.map((e) => e.id));
  let draft: ExplanationDraft | null = null;
  let feedback: string[] = [];
  let coverageAsked = false;
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
    // Un template choisi par le lecteur prime sur celui du rédacteur.
    if (input.template) draft = { ...draft, template_id: input.template };
    const ex = buildExplanation(input, ko, draft);
    const bp = buildBlueprint(draft, ex, ko, evidence, input.targetPages, input.visualMode);
    const v = new ValidationCollector();
    validateExplanation(ex, ko, evidenceIds, v);
    validateBlueprint(bp, ex, ko, evidenceIds, v);
    // Les réserves de la source ne disparaissent pas au passage à l'explication.
    const used = new Set(ex.sections.flatMap((x) => x.blocks.flatMap((b) => b.claim_ids)));
    const dropped = droppedCaveatClaims(ko.claims, used);
    const askCoverage = dropped.length > 0 && !coverageAsked && repair < MAX_REPAIRS;
    if ((v.blocking.length === 0 && !askCoverage) || repair === MAX_REPAIRS) {
      for (const id of dropped) v.fail("caveat_kept", "reference", [id], `réserve absente de l'explication : ${id}`, false);
      return { explanation: ex, blueprint: bp, validation: v.result(`${ex.id}@${SCHEMA_VERSION}`, repair) };
    }
    if (askCoverage) coverageAsked = true;
    feedback = [
      ...v.blocking,
      ...(askCoverage
        ? [`Ces affirmations portent une réserve ou une limite et n'apparaissent dans aucun bloc : ${dropped.join(", ")}. Reprends chacune dans un bloc "caution" (ou "fact") qui la cite dans claim_ids avec ses evidence_ids.`]
        : []),
    ];
  }
  throw new Error("inaccessible");
}

export async function generateReport(provider: AIProvider, input: GenerationInput): Promise<GenerationOutput> {
  if (input.segments.length === 0) throw new Error("Aucun segment à analyser.");
  const segments = new Map(input.segments.map((s) => [s.id, s]));
  await input.onStage?.("comprehension");
  const comp = await comprehension(provider, input, segments);
  let knowledge = comp.knowledge;
  let knowledgeValidation = comp.validation;
  if (input.verifyClaims) {
    // Vérification indépendante avant la rédaction : l'explication part des statuts vérifiés.
    await input.onStage?.("verification");
    const v = new ValidationCollector();
    knowledge = await verifyClaims(provider, input, comp.knowledge, comp.evidence, segments, v);
    const r = v.result("verification", 0);
    knowledgeValidation = {
      ...comp.validation,
      checks: [...comp.validation.checks, ...r.checks].slice(0, 500),
      warnings: [...comp.validation.warnings, ...r.warnings].slice(0, 200),
    };
  }
  await input.onStage?.("explication");
  // Seules les preuves localisées et cohérentes passent à la suite.
  const exp = await explanation(provider, input, knowledge, comp.evidence);
  const ok = knowledgeValidation.blocking_errors.length === 0 && exp.validation.blocking_errors.length === 0;
  return {
    status: ok ? "validated" : "incomplete",
    knowledge,
    evidence: comp.evidence,
    explanation: exp.explanation,
    blueprint: exp.blueprint,
    validation: { knowledge: knowledgeValidation, explanation: exp.validation },
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

/* ---------- Régénération ciblée d'une section (cahier V2, § 8 et § 20) ---------- */

export const SectionDraft = z.strictObject({ section: Section });

/**
 * Réécrit une seule section à partir de la connaissance validée ; le reste du rapport est
 * inchangé. Les blocs reçoivent de nouveaux identifiants, la numérotation des sources déjà
 * citées est conservée (les nouvelles s'ajoutent à la fin), et le document entier est
 * revalidé, avec au plus deux corrections.
 */
export async function regenerateSection(
  provider: AIProvider,
  input: Omit<GenerationInput, "segments" | "sourceId">,
  ko: KnowledgeObject,
  evidence: Evidence[],
  previous: ExplanationObject,
  previousBlueprint: ReportBlueprint,
  sectionId: string,
  variation: Variation,
) {
  const target = previous.sections.find((x) => x.id === sectionId);
  if (!target) throw new Error("Section inconnue.");
  const full: GenerationInput = { ...input, sourceId: ko.source_ids[0]!, segments: [] };
  const evidenceIds = new Set(evidence.map((e) => e.id));
  const stamp = Math.random().toString(36).slice(2, 7);
  const base = explanationInstructions(input.level, input.goal, input.preferences, previousBlueprint.target_pages, previousBlueprint.template_id);
  const scope = `Réécris UNIQUEMENT la section « ${target.question} » (fournie), sans toucher au reste du rapport. ${VARIATION_INSTRUCTIONS[variation].replace("la version précédente", "la section précédente")} Garde l'identifiant de section "${sectionId}" et une question proche. Renvoie { "section": … }.`;
  const data = [
    { label: "connaissance validee", text: knowledgePayload(ko, evidence) },
    { label: "section precedente", text: JSON.stringify(target) },
    { label: "autres sections (contexte)", text: previous.sections.filter((x) => x.id !== sectionId).map((x) => x.question).join("\n") },
  ];

  await input.onStage?.("explication");
  let feedback: string[] = [];
  for (let repair = 0; repair <= MAX_REPAIRS; repair++) {
    const req = feedback.length ? [...data, { label: "erreurs a corriger", text: feedback.join("\n") }] : data;
    const draft = await callWithRetry(provider, full, "explication", repair * 10, {
      schema: SectionDraft,
      instructions: `${base}\n${scope}${feedback.length ? "\nCorrige les erreurs listées." : ""}`,
      data: req,
      budget: input.budgets.explanation,
    });
    // Identifiants imposés : même section, blocs neufs et uniques dans tout le document.
    const section = {
      ...draft.section,
      id: sectionId,
      blocks: draft.section.blocks.map((b, i) => ({ ...b, id: `blk_${stamp}_${i + 1}` })),
    };
    const explanation: ExplanationObject = { ...previous, level: input.level, sections: previous.sections.map((x) => (x.id === sectionId ? section : x)) };
    const used = new Set(explanation.sections.flatMap((x) => x.blocks.flatMap((b) => b.evidence_ids)));
    // Index conservé tel quel : les numéros [n] déjà lus ne changent pas d'une version à l'autre.
    const kept = previousBlueprint.source_index;
    const added = [...used].filter((id) => evidenceIds.has(id) && !kept.includes(id));
    const blueprint: ReportBlueprint = { ...previousBlueprint, source_index: [...kept, ...added] };
    const v = new ValidationCollector();
    validateExplanation(explanation, ko, evidenceIds, v);
    validateBlueprint(blueprint, explanation, ko, evidenceIds, v);
    if (v.blocking.length === 0 || repair === MAX_REPAIRS) {
      await input.onStage?.("verification");
      return {
        explanation,
        blueprint,
        validation: v.result(`${explanation.id}@${SCHEMA_VERSION}`, repair),
        status: v.blocking.length === 0 ? ("validated" as const) : ("incomplete" as const),
      };
    }
    feedback = v.blocking;
  }
  throw new Error("inaccessible");
}
