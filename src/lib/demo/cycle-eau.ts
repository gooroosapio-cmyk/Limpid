/**
 * Rapport de DÉMONSTRATION, affiché comme tel et séparé des documents privés.
 * La source est un court texte rédigé pour l'application ; les objets ci-dessous
 * ont été écrits à la main (aucune génération IA) pour montrer le lecteur et
 * exercer les validateurs sur un cas complet.
 */
import { createHash } from "node:crypto";
import type {
  Evidence,
  ExplanationObject,
  KnowledgeObject,
  ReportBlueprint,
  SourceSegment,
} from "@/lib/contracts/schemas";
import { SCHEMA_VERSION } from "@/lib/contracts/schemas";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export const DEMO_SOURCE_ID = "src_demo_cycle_eau";
export const DEMO_SOURCE_TITLE = "Le cycle de l'eau (texte de démonstration)";

const PARAGRAPHS = [
  "L'eau circule en permanence entre les océans, l'atmosphère et les terres. Ce mouvement continu s'appelle le cycle de l'eau. Il est alimenté principalement par l'énergie du Soleil.",
  "Sous l'effet de la chaleur, l'eau des océans, des lacs et des sols s'évapore : elle passe de l'état liquide à l'état de vapeur. Les plantes rejettent aussi de la vapeur d'eau par leurs feuilles ; on parle de transpiration.",
  "En s'élevant, la vapeur se refroidit et se condense en fines gouttelettes qui forment les nuages. Lorsque les gouttelettes deviennent assez lourdes, elles tombent sous forme de pluie, de neige ou de grêle : ce sont les précipitations.",
  "Une partie de l'eau tombée ruisselle vers les rivières puis les océans. Une autre partie s'infiltre dans le sol et alimente les nappes souterraines, où elle peut rester des années, voire beaucoup plus longtemps.",
  "Les océans contiennent environ 97 % de l'eau de la planète. L'eau douce ne représente donc qu'une petite part du total, et une grande partie de cette eau douce est stockée dans les glaces.",
  "Les durées de séjour varient beaucoup selon les réservoirs et les estimations. Elles dépendent du climat et du lieu étudié.",
];

const SOURCE_VERSION = sha(PARAGRAPHS.join("\n\n"));

export const demoSegments: SourceSegment[] = PARAGRAPHS.map((text, i) => ({
  id: `seg_demo_${i + 1}`,
  source_id: DEMO_SOURCE_ID,
  source_version: SOURCE_VERSION,
  locator: { kind: "section", heading_path: ["Le cycle de l'eau"], paragraph: i + 1 },
  text,
  content_hash: sha(text),
  extraction_warnings: [],
}));

function ev(id: string, segIndex: number, quote: string): Evidence {
  const seg = demoSegments[segIndex]!;
  const start = seg.text.indexOf(quote);
  if (start < 0) throw new Error(`Citation introuvable : ${quote}`);
  return { id, segment_id: seg.id, start_offset: start, end_offset: start + quote.length, quote };
}

export const demoEvidence: Evidence[] = [
  ev("ev_1", 0, "L'eau circule en permanence entre les océans, l'atmosphère et les terres."),
  ev("ev_2", 0, "Il est alimenté principalement par l'énergie du Soleil."),
  ev("ev_3", 1, "elle passe de l'état liquide à l'état de vapeur"),
  ev("ev_4", 1, "Les plantes rejettent aussi de la vapeur d'eau par leurs feuilles ; on parle de transpiration."),
  ev("ev_5", 2, "la vapeur se refroidit et se condense en fines gouttelettes qui forment les nuages"),
  ev("ev_6", 2, "elles tombent sous forme de pluie, de neige ou de grêle : ce sont les précipitations"),
  ev("ev_7", 3, "Une partie de l'eau tombée ruisselle vers les rivières puis les océans."),
  ev("ev_8", 3, "Une autre partie s'infiltre dans le sol et alimente les nappes souterraines"),
  ev("ev_9", 4, "Les océans contiennent environ 97 % de l'eau de la planète."),
  ev("ev_10", 4, "une grande partie de cette eau douce est stockée dans les glaces"),
  ev("ev_11", 5, "Les durées de séjour varient beaucoup selon les réservoirs et les estimations."),
];

export const demoKnowledge: KnowledgeObject = {
  schema_version: SCHEMA_VERSION,
  id: "ko_demo_cycle_eau",
  source_ids: [DEMO_SOURCE_ID],
  concepts: [
    { id: "cpt_cycle", label: "Cycle de l'eau", definition_claim_ids: ["clm_1"], importance: "central", prerequisite_ids: [] },
    { id: "cpt_evap", label: "Évaporation", definition_claim_ids: ["clm_3"], importance: "central", prerequisite_ids: [] },
    { id: "cpt_cond", label: "Condensation", definition_claim_ids: ["clm_5"], importance: "central", prerequisite_ids: ["cpt_evap"] },
    { id: "cpt_prec", label: "Précipitations", definition_claim_ids: ["clm_6"], importance: "central", prerequisite_ids: ["cpt_cond"] },
  ],
  claims: [
    { id: "clm_1", statement: "L'eau circule en permanence entre les océans, l'atmosphère et les terres.", evidence_ids: ["ev_1"], qualifiers: [], numbers: [], support_status: "supported" },
    { id: "clm_2", statement: "Le cycle est alimenté principalement par l'énergie du Soleil.", evidence_ids: ["ev_2"], qualifiers: ["principalement"], numbers: [], support_status: "supported" },
    { id: "clm_3", statement: "L'évaporation fait passer l'eau de l'état liquide à l'état de vapeur.", evidence_ids: ["ev_3"], qualifiers: [], numbers: [], support_status: "supported" },
    { id: "clm_4", statement: "Les plantes rejettent de la vapeur d'eau par leurs feuilles (transpiration).", evidence_ids: ["ev_4"], qualifiers: [], numbers: [], support_status: "supported" },
    { id: "clm_5", statement: "En se refroidissant, la vapeur se condense en gouttelettes qui forment les nuages.", evidence_ids: ["ev_5"], qualifiers: [], numbers: [], support_status: "supported" },
    { id: "clm_6", statement: "Les gouttelettes devenues lourdes tombent en pluie, neige ou grêle : les précipitations.", evidence_ids: ["ev_6"], qualifiers: [], numbers: [], support_status: "supported" },
    { id: "clm_7", statement: "Une partie de l'eau ruisselle vers les rivières puis les océans.", evidence_ids: ["ev_7"], qualifiers: ["une partie"], numbers: [], support_status: "supported" },
    { id: "clm_8", statement: "Une autre partie s'infiltre et alimente les nappes souterraines.", evidence_ids: ["ev_8"], qualifiers: ["une autre partie"], numbers: [], support_status: "supported" },
    {
      id: "clm_9",
      statement: "Les océans contiennent environ 97 % de l'eau de la planète.",
      evidence_ids: ["ev_9"],
      qualifiers: ["environ"],
      numbers: [{ value: 97, unit: "%", scope: "eau de la planète", date: null, source_form: "97 %" }],
      support_status: "supported",
    },
    { id: "clm_10", statement: "Une grande partie de l'eau douce est stockée dans les glaces.", evidence_ids: ["ev_10"], qualifiers: ["une grande partie"], numbers: [], support_status: "supported" },
    { id: "clm_11", statement: "Les durées de séjour de l'eau varient selon les réservoirs et les estimations.", evidence_ids: ["ev_11"], qualifiers: [], numbers: [], support_status: "supported" },
  ],
  relations: [
    { id: "rel_1", from_id: "cpt_evap", to_id: "cpt_cond", kind: "precedes", claim_ids: ["clm_5"] },
    { id: "rel_2", from_id: "cpt_cond", to_id: "cpt_prec", kind: "precedes", claim_ids: ["clm_6"] },
  ],
  contradictions: [],
  missing_information: ["Le texte ne donne pas de durée de séjour chiffrée pour chaque réservoir."],
  coverage: { segments_total: 6, segments_processed: 6, unreadable_locators: [], partial: false },
};

export const demoExplanation: ExplanationObject = {
  schema_version: SCHEMA_VERSION,
  id: "exp_demo_cycle_eau",
  knowledge_id: demoKnowledge.id,
  level: "ultra_simple",
  goal: "comprendre",
  preferences_snapshot: { aids: ["exemples", "schemas"], minutes: 3, density: "essentiel", example_domain: "quotidien", familiarity: "aucune" },
  sections: [
    {
      id: "sec_1",
      question: "Où va l'eau ?",
      takeaway: "L'eau voyage sans arrêt entre la mer, le ciel et la terre.",
      blocks: [
        { type: "fact", id: "blk_1", text: "L'eau ne reste pas au même endroit. Elle passe des océans au ciel, puis du ciel à la terre.", claim_ids: ["clm_1"], evidence_ids: ["ev_1"] },
        { type: "fact", id: "blk_2", text: "Ce voyage a surtout besoin d'une chose : la chaleur du Soleil.", claim_ids: ["clm_2"], evidence_ids: ["ev_2"] },
      ],
    },
    {
      id: "sec_2",
      question: "Comment l'eau monte-t-elle dans le ciel ?",
      takeaway: "Chauffée, l'eau devient une vapeur invisible qui monte.",
      blocks: [
        { type: "definition", id: "blk_3", term: "Évaporation", text: "L'évaporation, c'est quand l'eau liquide devient de la vapeur.", claim_ids: ["clm_3"], evidence_ids: ["ev_3"] },
        { type: "fictional_example", id: "blk_4", text: "Exemple imaginé : du linge mouillé sèche au soleil. L'eau du linge part dans l'air sous forme de vapeur.", claim_ids: ["clm_3"], evidence_ids: [] },
        { type: "fact", id: "blk_5", text: "Les plantes aussi rejettent de la vapeur par leurs feuilles. On appelle cela la transpiration.", claim_ids: ["clm_4"], evidence_ids: ["ev_4"] },
      ],
    },
    {
      id: "sec_3",
      question: "D'où viennent les nuages et la pluie ?",
      takeaway: "La vapeur refroidit, forme des nuages, puis retombe.",
      blocks: [
        { type: "fact", id: "blk_6", text: "En haut, la vapeur refroidit. Elle forme de toutes petites gouttes. Ensemble, ces gouttes font les nuages.", claim_ids: ["clm_5"], evidence_ids: ["ev_5"] },
        {
          type: "analogy",
          id: "blk_7",
          text: "C'est un peu comme la buée sur un miroir froid après une douche chaude.",
          limit: "La buée reste collée au miroir ; dans le ciel, les gouttes flottent puis tombent quand elles sont trop lourdes.",
          claim_ids: ["clm_5"],
          evidence_ids: [],
        },
        { type: "fact", id: "blk_8", text: "Quand les gouttes deviennent lourdes, elles tombent : pluie, neige ou grêle.", claim_ids: ["clm_6"], evidence_ids: ["ev_6"] },
      ],
    },
    {
      id: "sec_4",
      question: "Que devient l'eau tombée au sol ?",
      takeaway: "Elle coule vers la mer ou entre dans le sol.",
      blocks: [
        { type: "fact", id: "blk_9", text: "Une partie de l'eau coule vers les rivières, puis vers la mer.", claim_ids: ["clm_7"], evidence_ids: ["ev_7"] },
        { type: "fact", id: "blk_10", text: "Une autre partie entre dans le sol. Elle remplit des réserves cachées sous terre : les nappes.", claim_ids: ["clm_8"], evidence_ids: ["ev_8"] },
      ],
    },
    {
      id: "sec_5",
      question: "Où se trouve l'eau de la Terre ?",
      takeaway: "Presque toute l'eau est salée, dans les océans.",
      blocks: [
        { type: "fact", id: "blk_11", text: "Selon le document, les océans contiennent environ 97 % de l'eau de la planète.", claim_ids: ["clm_9"], evidence_ids: ["ev_9"] },
        { type: "fact", id: "blk_12", text: "L'eau douce est donc rare. Et une grande partie est gelée, dans les glaces.", claim_ids: ["clm_10"], evidence_ids: ["ev_10"] },
        { type: "caution", id: "blk_13", text: "Le temps que l'eau passe dans chaque réservoir varie beaucoup. Le document ne donne pas de durée précise.", claim_ids: ["clm_11"], evidence_ids: ["ev_11"] },
      ],
    },
  ],
  glossary: [
    { term: "Évaporation", definition: "Passage de l'eau liquide à l'état de vapeur.", claim_ids: ["clm_3"] },
    { term: "Condensation", definition: "Passage de la vapeur à de fines gouttelettes, en refroidissant.", claim_ids: ["clm_5"] },
    { term: "Précipitations", definition: "Eau qui tombe des nuages : pluie, neige ou grêle.", claim_ids: ["clm_6"] },
  ],
  checks: [
    {
      id: "chk_1",
      question: "Pourquoi la vapeur forme-t-elle des nuages en montant ?",
      expected_points: ["La vapeur se refroidit en s'élevant.", "Elle se condense en fines gouttelettes."],
      evidence_ids: ["ev_5"],
      misconception_hints: ["Les nuages ne sont pas de la vapeur invisible : ce sont des gouttelettes."],
    },
  ],
  limitations: [
    "Ce rapport s'appuie sur un texte court de démonstration ; il ne couvre pas tous les aspects du cycle de l'eau.",
  ],
};

export const demoBlueprint: ReportBlueprint = {
  schema_version: SCHEMA_VERSION,
  id: "bp_demo_cycle_eau",
  explanation_id: demoExplanation.id,
  template_id: "comprendre_processus",
  target_pages: 5,
  title: "Le cycle de l'eau",
  sections: [
    { section_id: "sec_1", visual_ids: [], page_hint: 1 },
    { section_id: "sec_2", visual_ids: [], page_hint: 2 },
    { section_id: "sec_3", visual_ids: ["vis_flow"], page_hint: 3 },
    { section_id: "sec_4", visual_ids: [], page_hint: 4 },
    { section_id: "sec_5", visual_ids: [], page_hint: 5 },
  ],
  visual_specs: [
    {
      id: "vis_flow",
      kind: "flow",
      purpose: "Montrer l'enchaînement des étapes du cycle",
      claim_ids: ["clm_3", "clm_5", "clm_6", "clm_7"],
      evidence_ids: ["ev_3", "ev_5", "ev_6", "ev_7"],
      data: {
        steps: [
          { label: "Évaporation", claim_id: "clm_3" },
          { label: "Condensation", claim_id: "clm_5" },
          { label: "Précipitations", claim_id: "clm_6" },
          { label: "Ruissellement", claim_id: "clm_7" },
        ],
        cyclic: true,
      },
      alt_text: "Schéma en boucle : évaporation, puis condensation en nuages, puis précipitations, puis ruissellement vers les océans, et le cycle recommence.",
      caption: "Les grandes étapes du cycle de l'eau",
      illustrative_only: false,
    },
  ],
  source_index: demoEvidence.map((e) => e.id),
  layout_warnings: [],
};
