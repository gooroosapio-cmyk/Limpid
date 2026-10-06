/**
 * Pipeline de génération (payload 2, § 2) : compréhension → explication → mise en page.
 * Chaque étape IA produit un brouillon strict, complété et contrôlé côté serveur :
 * offsets calculés par le serveur, identifiants vérifiés, jusqu'à deux réparations.
 * La mise en page est déterministe ; le modèle ne dessine rien.
 */
import { z } from "zod";
import {
  blockClaimIds,
  blockEvidenceIds,
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
  type Mode,
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
import { ComparisonData, FlowData, safeImageQuery } from "@/lib/render/visuals";
import { ProviderError, type AIProvider, type StageBudget, type UsageReport } from "./provider";
import { blocksMissingNumbers, caveatGaps, droppedCaveatClaims, droppedNumberClaims, numberGaps } from "./coverage";
import { locateQuote } from "./quotes";

export const PROMPT_VERSION = "2026-10-07.1";
export const MAX_REPAIRS = 2;

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

/**
 * Réparations sûres d'un brouillon avant validation : une analogie sans limite devient un
 * exemple imaginé (jamais une comparaison présentée sans réserve) ; une variante sans
 * limite reçoit null. Le reste est validé tel quel.
 */
export function repairDraftBlocks(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const v = value as { sections?: { blocks?: Record<string, unknown>[] }[] };
  if (!Array.isArray(v.sections)) return value;
  return {
    ...v,
    sections: v.sections.map((sec) => ({
      ...sec,
      blocks: Array.isArray(sec?.blocks)
        ? sec.blocks.map((b) => {
            if (!b || typeof b !== "object") return b;
            let out = { ...b };
            if (Array.isArray(out.variants)) {
              out.variants = (out.variants as Record<string, unknown>[]).map((x) => (x && typeof x === "object" && !("limit" in x) ? { ...x, limit: null } : x));
            }
            if (out.type === "analogy" && (typeof out.limit !== "string" || !out.limit.trim())) {
              const { limit: _l, ...rest } = out;
              out = { ...rest, type: "fictional_example" };
            }
            return out;
          })
        : sec?.blocks,
    })),
  };
}

export const ExplanationDraft = z.preprocess(repairDraftBlocks, z.strictObject({
  title: z.string().trim().min(1).max(200),
  key_points: z.array(z.string().trim().min(1).max(300)).min(1).max(5),
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
        style: z.enum(["vector", "realistic"]).optional(),
      }),
    )
    .max(4)
    .optional(),
}));
export type ExplanationDraft = z.infer<typeof ExplanationDraft>;

/* ---------- Consignes (fiables, versionnées) ---------- */

/** Règles éditoriales par niveau (cahier V2, § 6) : le niveau change l'effort d'explication, jamais les réserves. */
export const LEVEL_GUIDE: Record<Level, string> = {
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
- Plusieurs documents (identifiants seg_d1-…, seg_d2-… : un préfixe par document) : chaque affirmation cite les segments du document qui la porte. Si deux documents divergent, crée une contradiction (ctr_…) qui expose les deux versions : ne fusionne pas en une seule vérité, et ne donne pas d'autorité particulière au premier document.
- Une ligne qui commence par « [Figure : » est une description de figure produite par la lecture du document, pas son texte : elle peut servir à comprendre un schéma, mais une affirmation qui en découle est au plus "partial" et le dit (« d'après la figure »). « [illisible] » marque une zone illisible : n'en déduis rien.
- N'utilise aucune connaissance extérieure à la source. Langue des textes produits : celle de la source.`;

/** Les quatre approches (V4) : ce qui change dans la rédaction, jamais dans les faits. */
export const MODE_GUIDE: Record<Mode, string> = {
  tres_simple:
    "TRÈS SIMPLE : mots courants, phrases directes, une idée à la fois, analogies et exemples du quotidien ; aucun prérequis supposé ; ton adulte, jamais infantilisant, aucune mention d'âge.",
  claire:
    "EXPLICATION CLAIRE : explication structurée qui conserve les termes utiles et définit les notions difficiles ; raisonnement pédagogique explicite (pourquoi, comment, donc).",
  resume:
    "RÉSUMÉ FIDÈLE : conserve les termes importants et le sens du document, condense l'essentiel ; AUCUNE analogie, AUCUN exemple inventé, AUCUN complément extérieur.",
  revision:
    "RÉVISION ACTIVE : des fiches courtes et denses (une notion par section : l'essentiel à retenir, 1 à 3 blocs), conçues pour être suivies d'exercices ; pas de longue prose.",
};

/** Nombre de pages pédagogiques prévu selon la richesse de la source et l'approche (repère, pas une promesse). */
export function planPages(sourceChars: number, mode: Mode): number {
  const base = sourceChars <= 6_000 ? 5 : sourceChars <= 15_000 ? 7 : sourceChars <= 40_000 ? 10 : sourceChars <= 90_000 ? 13 : 16;
  const adjusted = mode === "resume" ? Math.round(base * 0.75) : mode === "tres_simple" ? base + 1 : base;
  return Math.max(5, Math.min(18, adjusted));
}

function explanationInstructions(
  level: Level,
  goal: Goal,
  prefs: PreferencesSnapshot,
  targetPages: number,
  template: z.infer<typeof TemplateId> | null = null,
  mode: Mode = "claire",
  language: "fr" | "en" | null = null,
): string {
  const aids = prefs.aids.length ? prefs.aids.join(", ") : "aucune préférence";
  const templates = Object.entries(TEMPLATE_GUIDE)
    .map(([id, seq]) => `  · ${id} : ${seq}`)
    .join("\n");
  const noExamples = mode === "resume";
  return `Tu es le rédacteur pédagogique de Limpid (méthode Feynman, sans infantiliser). À partir d'un objet de connaissance validé, rédige une explication en vouvoyant le lecteur, ton adulte et respectueux.
Approche : ${MODE_GUIDE[mode]}
Principe : autant de mots que nécessaire pour comprendre, aucun mot uniquement pour remplir.
Profil : niveau « ${level} » (${LEVEL_GUIDE[level]}) ; objectif « ${goal} » ; aides préférées : ${aids} ; domaine d'exemples : ${prefs.example_domain ?? "neutre"} ; densité : ${prefs.density ?? "équilibrée"}.
Longueur : environ ${targetPages} pages pédagogiques de contenu, soit environ ${targetPages} sections (une section ≈ une page ≈ une idée développée : 120 à 220 mots, ou un visuel avec un texte court). Développe chaque notion importante de la source dans sa propre section plutôt que de tout regrouper. Chaque section compte 2 à 5 blocs et environ 100 à 220 mots : l'idée expliquée simplement (quoi, pourquoi, comment)${mode === "resume" ? ", ses éléments clés" : ", un exemple concret ou une analogie quand cela aide"}, puis sa conséquence ou sa limite.${mode === "tres_simple" ? " En mode très simple, la plupart des sections ont une analogie ou un exemple du quotidien (avec ses variants)." : ""} Les quiz, annexes et sources ne comptent pas. Seulement si la source est vraiment trop pauvre, fais moins de sections plutôt que de remplir ou d'inventer.
Densité (pages mises en forme sur téléphone) : ni grands vides ni surcharge. Paragraphes de 2 à 4 phrases ; pas de mur de texte. Une notion trop mince pour remplir une page (moins de 60 mots) est regroupée avec une notion voisine dans la même section ; une notion très riche est découpée en blocs courts (liste, étapes, idée clé) plutôt qu'en un long paragraphe.
Règles :
- title : informatif et court (pas de slogan). key_points : 3 à 5 points clés réellement utiles, une phrase chacun, sans répéter le titre.
- Le niveau change l'effort d'explication, jamais le sens : garde toutes les réserves, conditions, exceptions, unités et nombres qui changent la conclusion.
- Sections (sec_1…) : question = titre de la section (question du lecteur OU titre informatif court, selon ce qui est le plus clair) ; takeaway = l'idée d'une phrase. Ne commence pas chaque section par la même structure (question, définition ou « à retenir ») : un mécanisme devient une liste d'étapes, une distinction une comparaison, une chronologie une liste numérotée, une formule l'explication de ses symboles puis une application.
- Blocs (blk_1…, identifiants uniques dans tout le document) :
  · "fact" et "definition" = uniquement des affirmations "supported", citées dans claim_ids avec leurs evidence_ids. emphasis "key" (facultatif, 1 par section au plus) = l'idée la plus importante, mise en avant.
  · "list" : style "bullets", "numbers" ou "steps" ; text = phrase d'introduction ; items (2 à 12), chacun avec ses claim_ids et evidence_ids. Si des opérations de la source sont regroupées en moins d'étapes, dis-le explicitement dans text.
  · "formula" : expression exacte (texte), symbols (chaque symbole et sa signification avec son unité), text = comment la lire puis une application.
  · Une affirmation "partial" ou "ambiguous" va dans un bloc "caution" (ou une formulation explicitement prudente) ; "contradicted" : bloc "caution" qui expose le désaccord sans le trancher ; "unsupported" n'est pas utilisée.
${noExamples ? `  · Résumé fidèle : n'utilise PAS "analogy", "fictional_example" ni "complement".` : `  · "analogy" : idée cible, exemple familier, correspondance, puis sa limite dans limit (ce que la comparaison n'implique pas). "fictional_example" = exemple inventé, présenté comme tel. Pour chaque analogie ou exemple, variants = 1 ou 2 autres versions clairement différentes (autre situation, autre domaine), de même longueur, avec leur limit (null pour un exemple).
  · "complement" = connaissance générale absente de la source, utile pour comprendre, sans claim_ids ni evidence_ids (elle sera signalée « Complément »). Avec parcimonie.`}
  · "inference" = déduction, présentée comme telle. "caution" = limite, incertitude ou réserve.
- Mise en forme : **gras** pour 1 à 3 expressions clés par section, *italique* avec parcimonie. Pas de titres dans les textes, pas de listes à plusieurs niveaux.
- N'utilise que les identifiants clm_… et ev_… fournis. Aucun fait nouveau hors des affirmations (sauf blocs "complement").
- glossary : termes clés. checks (chk_…) : 1 à 3 questions qui demandent de reformuler le mécanisme ou de l'appliquer, avec points attendus et evidence_ids.
- limitations : ce que le rapport ne couvre pas (couverture partielle, informations manquantes, parties seulement résumées, limites du document).
- template_id ${template ? `: "${template}" (imposé par le lecteur)` : "au choix"}, et l'ordre des sections suit sa séquence :
${templates}
  Sans indication : "comprendre_processus" pour une suite d'étapes, "comparer_options" pour une comparaison, "expliquer_document" pour un document précis, sinon "comprendre_sujet".
- flow : null. chart : null (aucun schéma ni graphique dans le cours).
- comparison : seulement si la source compare des options : critères identiques pour chaque option, une cellule par critère (texte ≤ 80 caractères et claim_id "supported", ou text et claim_id null si la source ne dit rien) ; sinon null.
- illustrations : ${noExamples ? "[] (aucune)" : "0 à 4 idées d'illustration générique qui simplifient une notion complexe (section_id, query = 2 à 5 mots-clés EN ANGLAIS décrivant une scène ou un objet courant, sans nom propre, sans chiffre, sans donnée du document ; subject = sujet ; alt_text). Aucune illustration ne porte un fait."}
- Langue : ${language === "en" ? "anglais (English), quelle que soit la langue de la source" : language === "fr" ? "français, quelle que soit la langue de la source" : "celle des affirmations"}.`;
}

/* ---------- Exécution ---------- */

export interface GenerationInput {
  sourceId: string;
  /** Limpid commun : tous les documents (identifiants du moteur), le premier valant sourceId. */
  sourceIds?: string[];
  segments: SourceSegment[];
  level: Level;
  goal: Goal;
  targetPages: number;
  /** Approche choisie à l'import (défaut : explication claire). */
  mode?: Mode;
  /** Langue des explications (null : celle de la source). */
  language?: "fr" | "en" | null;
  preferences: PreferencesSnapshot;
  signal: AbortSignal;
  budgets: { comprehension: StageBudget; explanation: StageBudget; plan?: StageBudget };
  /** Appelé après chaque appel au fournisseur (journal de consommation). */
  onUsage?: (stage: string, attempt: number, usage: UsageReport) => void | Promise<void>;
  /** Appelé au début de chaque étape (progression affichée, heartbeat du worker). */
  onStage?: (stage: "comprehension" | "explication" | "verification" | "plan") => void | Promise<void>;
  /** Vérification indépendante des affirmations contre leurs extraits (1 appel rapide). */
  verifyClaims?: boolean;
  /** Template imposé par le lecteur (sinon choisi par le rédacteur). */
  template?: z.infer<typeof TemplateId> | null;
  /** Visuels permis : « aucun » = texte seul, « schemas » = sans illustration. */
  visualMode?: VisualMode;
  /**
   * Plan préalable (Atlas) : chapitres, visuels prévus et passages difficiles, par le modèle
   * léger ; un document jugé complexe est rédigé par le modèle Pro. Sans effet si absent.
   */
  plan?: boolean;
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

export async function callWithRetry<T extends z.ZodType>(
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
        preferFallback: fixes === MAX_SCHEMA_FIXES,
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

export async function comprehension(provider: AIProvider, input: GenerationInput, segments: Map<string, SourceSegment>) {
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
    const figures = numberGaps(input.segments, evidence);
    const gapLines = [
      ...gaps.map(
        (g) => `${g.segment_id}: réserve ou limite non reprise — « ${g.sentence} ». Ajoute l'affirmation correspondante, avec ses qualifiers et une preuve copiée mot pour mot ; une limite du document est aussi une affirmation sourcée (ex. « Le document ne traite pas de … »).`,
      ),
      ...figures.map(
        (g) => `${g.segment_id}: chiffre non repris — « ${g.sentence} ». Ajoute l'affirmation correspondante, avec ses nombres (source_form exacte) et une preuve copiée mot pour mot.`,
      ),
    ];
    const askCoverage = gapLines.length > 0 && !coverageAsked && repair < MAX_REPAIRS;
    if ((v.blocking.length === 0 && !askCoverage) || repair === MAX_REPAIRS) {
      for (const g of gaps) v.fail("caveat_covered", "reference", [g.segment_id], `réserve non reprise : « ${g.sentence.slice(0, 120)} »`, false);
      for (const g of figures) v.fail("figure_covered", "number_match", [g.segment_id], `chiffre non repris : « ${g.sentence.slice(0, 120)} »`, false);
      if (gaps.length === 0) v.pass("caveat_covered", "reference", []);
      if (figures.length === 0) v.pass("figure_covered", "number_match", []);
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
export async function verifyClaims(
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
    source_ids: input.sourceIds?.length ? input.sourceIds.slice(0, 10) : [input.sourceId],
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

/** Retire les marques de mise en forme pour compter les mots. */
const plain = (t: string) => t.replace(/\*\*?([^*]+)\*\*?/g, "$1");

export function buildExplanation(input: GenerationInput, ko: KnowledgeObject, draft: ExplanationDraft): ExplanationObject {
  const mode = input.mode ?? "claire";
  // Résumé fidèle : ni analogie, ni exemple inventé, ni complément (le moteur l'impose).
  const strip = (b: z.infer<typeof Section>["blocks"][number]) => mode !== "resume" || !["analogy", "fictional_example", "complement"].includes(b.type);
  const sections = draft.sections
    .map((x) => ({
      ...x,
      blocks: x.blocks
        .filter(strip)
        // Un complément n'est jamais présenté comme justifié par la source.
        .map((b) => (b.type === "complement" ? { ...b, claim_ids: [], evidence_ids: [] } : b)),
    }))
    .filter((x) => x.blocks.length > 0);
  const words = sections
    .flatMap((x) => x.blocks.flatMap((b) => [b.text, ...(b.type === "list" ? b.items.map((i) => i.text) : [])]))
    .join(" ")
    .split(/\s+/).length;
  const keyPoints = [...new Set(draft.key_points.map((k) => plain(k).trim()).filter(Boolean))].slice(0, 7);
  return {
    schema_version: SCHEMA_VERSION,
    id: `exp_${ko.id.slice(3)}`,
    knowledge_id: ko.id,
    level: input.level,
    goal: input.goal,
    mode,
    key_points: keyPoints,
    // Résultat court annoncé seulement quand la source elle-même est pauvre (peu d'affirmations
    // soutenues), jamais pour masquer une rédaction trop mince.
    short_result: mode !== "revision" && ko.claims.filter((c) => c.support_status === "supported").length < 6 && words < 300,
    preferences_snapshot: input.preferences,
    sections: sections.length ? sections : draft.sections.slice(0, 1),
    glossary: draft.glossary,
    checks: draft.checks,
    limitations: draft.limitations,
  };
}

const VISUAL_LAYOUT: Record<VisualSpec["kind"], Pick<VisualSpec, "size" | "placement">> = {
  flow: { size: "wide", placement: "after" },
  steps: { size: "wide", placement: "after" },
  timeline: { size: "wide", placement: "after" },
  concept_map: { size: "wide", placement: "center" },
  comparison_table: { size: "wide", placement: "after" },
  bar_chart: { size: "compact", placement: "after" },
  // Images et dessins incrustés dans le texte : il les entoure puis continue sous leur pied.
  illustration: { size: "compact", placement: "wrap" },
  drawing: { size: "thumb", placement: "wrap" },
};

/** Mise en page déterministe : ordre des sections, schémas validés, illustrations, index des sources. */
export function buildBlueprint(
  draft: ExplanationDraft,
  ex: ExplanationObject,
  ko: KnowledgeObject,
  evidence: Evidence[],
  targetPages: number,
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
      ex.sections.find((x) => x.blocks.some((b) => blockClaimIds(b).some((c) => claimIds.includes(c))))?.id ??
      ex.sections[0]!.id;
    placed.set(target, [...(placed.get(target) ?? []), visualId].slice(0, 5));
  };

  // V5 : aucun schéma ni graphique tracé par le code (flow et chart ignorés) ; seul le tableau
  // comparatif, rendu en HTML, reste un visuel de données.
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
      const claimIds = sec ? [...new Set(sec.blocks.flatMap(blockClaimIds))].filter(supported).slice(0, 5) : [];
      if (!sec || !query || claimIds.length === 0 || n >= 3) continue;
      const id = `vis_ill_${++n}`;
      visuals.push({
        id,
        kind: "illustration",
        purpose: "Illustrer une idée (sans valeur de preuve)",
        claim_ids: claimIds,
        evidence_ids: [],
        data: { query, subject: idea.subject, asset_id: null, ...(idea.style ? { style: idea.style } : {}) },
        alt_text: idea.alt_text,
        caption: idea.subject,
        illustrative_only: true,
      });
      place(id, claimIds, sec.id);
    }
  }

  const perPage = Math.max(1, Math.ceil(ex.sections.length / targetPages));
  const used = new Set(ex.sections.flatMap((x) => x.blocks.flatMap(blockEvidenceIds)));
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
      page_hint: Math.min(18, Math.floor(i / perPage) + 1),
    })),
    // Intentions de composition par nature de visuel ; le lecteur les adapte à l'écran.
    visual_specs: visuals.map((x) => ({ ...x, ...VISUAL_LAYOUT[x.kind] })),
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
  const base = explanationInstructions(input.level, input.goal, input.preferences, input.targetPages, input.template ?? null, input.mode ?? "claire", input.language ?? null);
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
    const used = new Set(ex.sections.flatMap((x) => x.blocks.flatMap(blockClaimIds)));
    const dropped = droppedCaveatClaims(ko.claims, used);
    // Chiffres soutenus oubliés : rappelés une fois (le rédacteur garde ceux qui comptent).
    const numeric = droppedNumberClaims(ko.claims, used).filter((id) => !dropped.includes(id));
    // Un bloc qui cite une affirmation chiffrée doit en reprendre les nombres exacts.
    const unnumbered = blocksMissingNumbers(ex.sections, ko.claims);
    // Explication trop mince pour la richesse de la source : une demande d'étoffement, une fois.
    const words = ex.sections.flatMap((x) => x.blocks.flatMap((b) => [b.text, ...(b.type === "list" ? b.items.map((i) => i.text) : [])])).join(" ").split(/\s+/).length;
    const supportedClaims = ko.claims.filter((c) => c.support_status === "supported").length;
    const thin = (input.mode ?? "claire") !== "revision" && words < input.targetPages * 90 && supportedClaims >= input.targetPages * 2;
    // « Autre exemple » sans requête IA : chaque exemple ou analogie a ses variantes préchargées.
    const noVariants =
      (input.mode ?? "claire") === "resume"
        ? []
        : ex.sections.flatMap((x) => x.blocks.filter((b) => (b.type === "analogy" || b.type === "fictional_example") && !b.variants?.length).map((b) => b.id));
    const askCoverage =
      (dropped.length > 0 || numeric.length > 0 || unnumbered.length > 0 || thin || noVariants.length > 0) && !coverageAsked && repair < MAX_REPAIRS;
    if ((v.blocking.length === 0 && !askCoverage) || repair === MAX_REPAIRS) {
      for (const id of dropped) v.fail("caveat_kept", "reference", [id], `réserve absente de l'explication : ${id}`, false);
      for (const id of numeric) v.fail("figure_kept", "number_match", [id], `chiffre absent de l'explication : ${id}`, false);
      for (const m of unnumbered) v.fail("figure_in_text", "number_match", [m.block_id], `nombres cités mais absents du texte : ${m.numbers.join(", ")}`, false);
      return { explanation: ex, blueprint: bp, validation: v.result(`${ex.id}@${SCHEMA_VERSION}`, repair) };
    }
    if (askCoverage) coverageAsked = true;
    feedback = [
      ...v.blocking,
      ...(askCoverage
        ? [
            ...(dropped.length
              ? [`Ces affirmations portent une réserve ou une limite et n'apparaissent dans aucun bloc : ${dropped.join(", ")}. Reprends chacune dans un bloc "caution" (ou "fact") qui la cite dans claim_ids avec ses evidence_ids.`]
              : []),
            ...unnumbered.map(
              (m) => `Le bloc ${m.block_id} cite une affirmation chiffrée sans en donner les nombres : écris-les tels quels (${m.numbers.join(", ")}).`,
            ),
            ...(noVariants.length
              ? [`Ces exemples ou analogies n'ont pas de variants : ${noVariants.join(", ")}. Ajoute à chacun 1 ou 2 variants clairement différents (autre situation, autre domaine), de longueur proche.`]
              : []),
            ...(thin
              ? [`L'explication est trop mince (${words} mots pour environ ${input.targetPages} pages) : développe chaque section (100 à 220 mots : explication du pourquoi et du comment, exemple ou analogie selon l'approche, conséquence ou limite), sans ajouter de fait absent des affirmations.`]
              : []),
            ...(numeric.length
              ? [`Ces affirmations chiffrées n'apparaissent dans aucun bloc : ${numeric.join(", ")}. Reprends celles qui comptent pour comprendre le document, dans un bloc "fact" qui les cite avec leurs evidence_ids et leurs nombres exacts.`]
              : []),
          ]
        : []),
    ];
  }
  throw new Error("inaccessible");
}

/** Compréhension validée (et plan) : point de reprise d'une génération interrompue. */
export interface Understanding {
  knowledge: KnowledgeObject;
  evidence: Evidence[];
  validation: ValidationResult;
  plan: ReportPlan | null;
}

/** Compréhension, vérification indépendante puis plan : tout ce qui précède la rédaction. */
export async function understand(provider: AIProvider, input: GenerationInput): Promise<Understanding> {
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
  let plan: ReportPlan | null = null;
  if (input.plan) {
    await input.onStage?.("plan");
    plan = await planReport(provider, input, knowledge);
  }
  return { knowledge, evidence: comp.evidence, validation: knowledgeValidation, plan };
}

/** Rédaction à partir d'une compréhension validée (fraîche ou reprise). */
export async function write(provider: AIProvider, input: GenerationInput, u: Understanding): Promise<GenerationOutput> {
  await input.onStage?.("explication");
  // Seules les preuves localisées et cohérentes passent à la suite.
  const exp = await explanation(provider, { ...input, budgets: { ...input.budgets, explanation: explanationBudget(input.budgets.explanation, u.plan) } }, u.knowledge, u.evidence, u.plan ? planVariation(u.plan) : undefined);
  const ok = u.validation.blocking_errors.length === 0 && exp.validation.blocking_errors.length === 0;
  return {
    status: ok ? "validated" : "incomplete",
    knowledge: u.knowledge,
    evidence: u.evidence,
    explanation: exp.explanation,
    blueprint: exp.blueprint,
    validation: { knowledge: u.validation, explanation: exp.validation },
  };
}

export async function generateReport(provider: AIProvider, input: GenerationInput): Promise<GenerationOutput> {
  return write(provider, input, await understand(provider, input));
}

/* ---------- Plan (Atlas : chapitres, visuels, passages difficiles) ---------- */

export const PlanDraft = z.strictObject({
  difficulty: z.enum(["standard", "complexe"]),
  difficult_claim_ids: z.array(z.string().max(40)).max(40),
  chapters: z
    .array(
      z.strictObject({
        title: z.string().min(1).max(160),
        claim_ids: z.array(z.string().max(40)).max(60),
        visual: z.enum(["aucun", "schema", "graphique", "illustration"]),
      }),
    )
    .min(1)
    .max(12),
});
export const ReportPlan = PlanDraft;
export type ReportPlan = z.infer<typeof PlanDraft>;

const PLAN_INSTRUCTIONS = (pages: number) =>
  `Tu prépares le plan d'un support explicatif d'environ ${pages} pages à partir d'une connaissance validée (affirmations sourcées).
Renvoie : des chapitres dans l'ordre de lecture (titre court, affirmations couvertes par leurs identifiants, visuel utile : aucun, schéma, graphique pour des nombres comparables, illustration pour une idée concrète) ; les affirmations difficiles à expliquer (raisonnement en plusieurs étapes, notions techniques, chiffres à interpréter, réserves subtiles) ; une difficulté globale « complexe » seulement si une part importante du document l'est.
N'invente aucune affirmation : utilise uniquement les identifiants fournis.`;

/** Garde les identifiants connus et un nombre de chapitres proportionné à la longueur visée. */
export function normalizePlan(draft: ReportPlan, ko: KnowledgeObject, targetPages: number): ReportPlan | null {
  const known = new Set(ko.claims.map((c) => c.id));
  const chapters = draft.chapters
    .map((c) => ({ ...c, title: c.title.trim(), claim_ids: [...new Set(c.claim_ids.filter((id) => known.has(id)))] }))
    .filter((c) => c.title && c.claim_ids.length > 0)
    .slice(0, Math.max(2, Math.min(12, targetPages + 2)));
  if (chapters.length === 0) return null;
  const difficult = [...new Set(draft.difficult_claim_ids.filter((id) => known.has(id)))];
  return { difficulty: difficult.length ? draft.difficulty : "standard", difficult_claim_ids: difficult, chapters };
}

/** Un seul appel au modèle léger ; un échec laisse la rédaction sans plan (jamais bloquant). */
export async function planReport(provider: AIProvider, input: GenerationInput, ko: KnowledgeObject): Promise<ReportPlan | null> {
  const budget = input.budgets.plan ?? { tier: "lite" as const, maxInputTokens: 60_000, maxOutputTokens: 4_000, timeoutMs: 60_000 };
  const claims = ko.claims.map((c) => ({ id: c.id, statement: c.statement, support_status: c.support_status, numbers: c.numbers.length, qualifiers: c.qualifiers }));
  try {
    const res = await provider.generateStructured({
      stage: "plan",
      schema: PlanDraft,
      trustedInstructions: PLAN_INSTRUCTIONS(input.targetPages),
      untrustedData: [{ label: "connaissance validee", text: JSON.stringify({ claims, concepts: ko.concepts.map((c) => ({ id: c.id, label: c.label, importance: c.importance })) }) }],
      budget,
      signal: input.signal,
    });
    await input.onUsage?.("plan", 0, res.usage);
    return normalizePlan(res.value, ko, input.targetPages);
  } catch (e) {
    if (e instanceof ProviderError && e.usage) await input.onUsage?.("plan", 0, e.usage);
    if (e instanceof ProviderError && e.code === "cancelled") throw e;
    return null;
  }
}

/** Pro ciblé : un document jugé complexe par le plan est rédigé par le modèle Pro. */
export function explanationBudget(base: StageBudget, plan: ReportPlan | null): StageBudget {
  return plan?.difficulty === "complexe" ? { ...base, tier: "complex" } : base;
}

/** Le plan devient une donnée de la rédaction ; les passages difficiles sont expliqués pas à pas. */
export function planVariation(plan: ReportPlan): { instructions: string; data: { label: string; text: string }[] } {
  return {
    instructions:
      "Un plan préparé est fourni : suis l'ordre et le découpage de ses chapitres (une section par chapitre, fusionne ou scinde seulement si la connaissance l'exige). Pour chaque affirmation listée comme difficile, explique pas à pas (étapes, puis un exemple ou une analogie selon l'approche).",
    data: [{ label: "plan", text: JSON.stringify(plan) }],
  };
}

/**
 * Revérifie la connaissance contre la source (information signalée comme incorrecte) :
 * les statuts ne peuvent que devenir plus prudents.
 */
export async function reverifyKnowledge(
  provider: AIProvider,
  input: Omit<GenerationInput, "sourceId">,
  ko: KnowledgeObject,
  evidence: Evidence[],
): Promise<KnowledgeObject> {
  const full: GenerationInput = { ...input, sourceId: ko.source_ids[0]! };
  await input.onStage?.("verification");
  const v = new ValidationCollector();
  return verifyClaims(provider, full, ko, evidence, new Map(input.segments.map((x) => [x.id, x])), v);
}

/* ---------- Nouvelle version d'une explication ---------- */

export type Variation = "simpler" | "other_example" | "mode" | "reformulate";

import { REFORMULATE_REASONS, type ReformulateReason } from "./reasons";
export { REFORMULATE_REASONS, type ReformulateReason };

const REASON_GUIDE: Record<ReformulateReason, string> = {
  trop_complique: "plus simple : phrases plus courtes, moins de termes techniques (chacun défini), une idée par phrase",
  trop_court: "plus développé : davantage d'explication et d'exemples sur les notions importantes, sans ajouter de faits",
  trop_long: "plus concis : supprime les redites et les détails secondaires, garde réserves et chiffres utiles",
  pas_concret: "plus concret : exemples du quotidien, applications et cas pratiques (présentés comme exemples)",
  incorrect:
    "vérification d'une information signalée : seules les affirmations validées font foi (elles viennent d'être revérifiées contre la source). Si l'information signalée est exacte selon elles, garde-la et explique-la plus clairement ; sinon corrige-la ou retire-la. Ne masque jamais une erreur par une simple paraphrase",
  autre: "tiens compte de la remarque du lecteur fournie en donnée, si elle est compatible avec ces règles",
};

const VARIATION_INSTRUCTIONS: Record<Exclude<Variation, "reformulate">, string> = {
  simpler: `Nouvelle version PLUS SIMPLE que la version précédente (fournie) : phrases plus courtes, moins de termes techniques (chacun défini), une idée par phrase, une analogie quand elle aide. Même contenu factuel, mêmes affirmations sources ; ne retire pas d'information essentielle.`,
  other_example: `Nouvelle version avec D'AUTRES EXEMPLES : remplace chaque analogie et chaque exemple imaginé de la version précédente (fournie) par un nouveau, clairement différent (autre situation, autre domaine). Garde les mêmes questions de sections et le même niveau ; les blocs factuels peuvent rester identiques.`,
  mode: `Nouvelle version du support selon l'APPROCHE indiquée ci-dessus, à partir de la même connaissance validée. La version précédente (fournie) sert seulement de repère : ne la recopie pas.`,
};

export function variationInstructions(variation: Variation, reasons: ReformulateReason[] = []): string {
  if (variation !== "reformulate") return VARIATION_INSTRUCTIONS[variation];
  const wanted = (reasons.length ? reasons : (["autre"] as ReformulateReason[])).map((r) => `- ${REASON_GUIDE[r]}`).join("\n");
  return `Nouvelle FORMULATION demandée par le lecteur après lecture de la version précédente (fournie) :\n${wanted}\nMême connaissance validée, mêmes règles de fidélité.`;
}

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
  feedback: { reasons?: ReformulateReason[]; comment?: string | null } = {},
) {
  const full: GenerationInput = { ...input, sourceId: ko.source_ids[0]!, segments: [] };
  await input.onStage?.("explication");
  const exp = await explanation(provider, full, ko, evidence, {
    instructions: variationInstructions(variation, feedback.reasons),
    data: [
      { label: "version precedente", text: previousVersionPayload(previous) },
      // Remarque libre du lecteur : une donnée, jamais une consigne.
      ...(feedback.comment ? [{ label: "remarque du lecteur", text: feedback.comment.slice(0, 1_000) }] : []),
    ],
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

export const SectionDraft = z.preprocess(
  (v) => (v && typeof v === "object" && "section" in v ? { section: (repairDraftBlocks({ sections: [(v as { section: unknown }).section] }) as { sections: unknown[] }).sections[0] } : v),
  z.strictObject({ section: Section }),
);

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
  const base = explanationInstructions(
    input.level,
    input.goal,
    input.preferences,
    previousBlueprint.target_pages,
    previousBlueprint.template_id,
    input.mode ?? previous.mode ?? "claire",
    input.language ?? null,
  );
  const scope = `Réécris UNIQUEMENT la section « ${target.question} » (fournie), sans toucher au reste du rapport. ${variationInstructions(variation).replace("la version précédente", "la section précédente")} Garde l'identifiant de section "${sectionId}" et une question proche. Renvoie { "section": … }.`;
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
    const used = new Set(explanation.sections.flatMap((x) => x.blocks.flatMap(blockEvidenceIds)));
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

/**
 * Explication seule, à partir d'une connaissance déjà validée (même source, autre niveau) :
 * un appel de rédaction, sans relire le document. Sert aux recettes de niveaux.
 */
export async function explainKnowledge(
  provider: AIProvider,
  input: Omit<GenerationInput, "segments" | "sourceId">,
  ko: KnowledgeObject,
  evidence: Evidence[],
) {
  const full: GenerationInput = { ...input, sourceId: ko.source_ids[0]!, segments: [] };
  return explanation(provider, full, ko, evidence);
}
