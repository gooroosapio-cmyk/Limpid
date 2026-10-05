/**
 * Contrôles sémantiques déterministes (payload 2, § 2-F, § 3, § 5).
 * Le schéma garantit la structure ; ces fonctions vérifient que les références
 * se résolvent, que les extraits existent réellement dans la source et que les
 * chiffres annoncés figurent dans les preuves. Elles ne prouvent pas la vérité.
 */
import {
  blockClaimIds,
  blockEvidenceIds,
  type Evidence,
  type ExplanationObject,
  type KnowledgeObject,
  type ReportBlueprint,
  type SourceSegment,
  type ValidationResult,
} from "./schemas";

type Check = ValidationResult["checks"][number];

export class ValidationCollector {
  readonly checks: Check[] = [];
  readonly blocking: string[] = [];
  readonly warnings: string[] = [];

  fail(name: string, method: Check["method"], objectIds: string[], detail: string, blocking = true) {
    this.checks.push({ name, method, object_ids: objectIds.slice(0, 100), passed: false, detail });
    (blocking ? this.blocking : this.warnings).push(`${name}: ${detail}`);
  }

  pass(name: string, method: Check["method"], objectIds: string[]) {
    this.checks.push({ name, method, object_ids: objectIds.slice(0, 100), passed: true, detail: null });
  }

  result(objectVersion: string, repairCount = 0): ValidationResult {
    return {
      object_version: objectVersion,
      checks: this.checks.slice(0, 500),
      blocking_errors: this.blocking.slice(0, 200),
      warnings: this.warnings.slice(0, 200),
      repair_count: repairCount,
    };
  }
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) (seen.has(v) ? dup : seen).add(v);
  return [...dup];
}

/** Normalise espaces et casse pour comparer un extrait au texte source sans être trompé par la mise en forme. */
export function normalizeForMatch(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Vérifie qu'une preuve pointe vers un segment autorisé et que la citation correspond exactement aux offsets. */
export function validateEvidence(
  evidence: Evidence[],
  segments: Map<string, SourceSegment>,
  v: ValidationCollector,
) {
  for (const dup of findDuplicates(evidence.map((e) => e.id))) {
    v.fail("evidence_unique", "reference", [dup], "identifiant de preuve dupliqué");
  }
  for (const e of evidence) {
    const seg = segments.get(e.segment_id);
    if (!seg) {
      v.fail("evidence_segment_exists", "reference", [e.id], `segment inconnu ${e.segment_id}`);
      continue;
    }
    if (e.end_offset > seg.text.length) {
      v.fail("evidence_offsets", "quote_match", [e.id], "offsets hors du segment");
      continue;
    }
    const slice = seg.text.slice(e.start_offset, e.end_offset);
    if (normalizeForMatch(slice) !== normalizeForMatch(e.quote)) {
      v.fail("evidence_quote_match", "quote_match", [e.id], "la citation ne correspond pas au texte source");
    } else {
      v.pass("evidence_quote_match", "quote_match", [e.id]);
    }
  }
}

/** Formes textuelles plausibles d'un nombre en français et en anglais. */
function numberForms(value: number): string[] {
  const forms = new Set<string>();
  const plain = String(value);
  forms.add(plain);
  forms.add(plain.replace(".", ","));
  const fr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 }).format(value);
  forms.add(fr);
  forms.add(fr.replace(/ | /g, " "));
  forms.add(fr.replace(/ | /g, ""));
  forms.add(new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value));
  return [...forms].map(normalizeForMatch);
}

export function validateKnowledge(
  ko: KnowledgeObject,
  evidence: Evidence[],
  v: ValidationCollector,
) {
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  const claimIds = new Set(ko.claims.map((c) => c.id));
  const conceptIds = new Set(ko.concepts.map((c) => c.id));

  for (const dup of findDuplicates([
    ...ko.claims.map((c) => c.id),
    ...ko.concepts.map((c) => c.id),
    ...ko.relations.map((r) => r.id),
  ])) {
    v.fail("knowledge_ids_unique", "reference", [dup], "identifiant dupliqué");
  }

  for (const c of ko.claims) {
    const missing = c.evidence_ids.filter((eid) => !evidenceById.has(eid));
    if (missing.length) {
      v.fail("claim_evidence_exists", "reference", [c.id, ...missing], "preuve inexistante");
    }
    if (c.support_status === "supported" && c.evidence_ids.length === 0) {
      v.fail("claim_supported_has_evidence", "reference", [c.id], "affirmation « supported » sans preuve");
    }
    // Les chiffres doivent apparaître dans au moins une preuve citée (forme source ou valeur).
    const quotes = c.evidence_ids
      .map((eid) => evidenceById.get(eid)?.quote)
      .filter((q): q is string => !!q)
      .map(normalizeForMatch);
    for (const n of c.numbers) {
      const candidates = [normalizeForMatch(n.source_form), ...numberForms(n.value)];
      const found = quotes.some((q) => candidates.some((form) => form && q.includes(form)));
      if (!found) {
        v.fail("claim_number_in_evidence", "number_match", [c.id], `nombre « ${n.source_form} » absent des preuves`);
      } else {
        v.pass("claim_number_in_evidence", "number_match", [c.id]);
      }
    }
  }

  const nodeIds = new Set([...claimIds, ...conceptIds]);
  for (const r of ko.relations) {
    if (!nodeIds.has(r.from_id) || !nodeIds.has(r.to_id)) {
      v.fail("relation_endpoints", "reference", [r.id], "relation orpheline");
    }
    for (const cid of r.claim_ids) {
      if (!claimIds.has(cid)) v.fail("relation_claims", "reference", [r.id, cid], "affirmation inexistante");
    }
  }
  for (const concept of ko.concepts) {
    for (const ref of [...concept.definition_claim_ids, ...concept.prerequisite_ids]) {
      if (!nodeIds.has(ref)) v.fail("concept_refs", "reference", [concept.id, ref], "référence inexistante");
    }
  }
  for (const ct of ko.contradictions) {
    for (const cid of ct.claim_ids) {
      if (!claimIds.has(cid)) v.fail("contradiction_claims", "reference", [ct.id, cid], "affirmation inexistante");
    }
  }
  if (ko.coverage.segments_processed > ko.coverage.segments_total) {
    v.fail("coverage_consistent", "reference", [ko.id], "segments traités > segments totaux");
  }
}

export function validateExplanation(
  ex: ExplanationObject,
  ko: KnowledgeObject,
  evidenceIds: Set<string>,
  v: ValidationCollector,
) {
  if (ex.knowledge_id !== ko.id) {
    v.fail("explanation_knowledge_link", "reference", [ex.id], "knowledge_id ne correspond pas");
  }
  const claims = new Map(ko.claims.map((c) => [c.id, c]));
  const blockIds: string[] = [];

  for (const section of ex.sections) {
    for (const b of section.blocks) {
      blockIds.push(b.id);
      for (const cid of blockClaimIds(b)) {
        if (!claims.has(cid)) v.fail("block_claims_exist", "reference", [b.id, cid], "affirmation inexistante");
      }
      for (const eid of blockEvidenceIds(b)) {
        if (!evidenceIds.has(eid)) v.fail("block_evidence_exist", "reference", [b.id, eid], "preuve inexistante");
      }
      // Les éléments d'une liste rapportent des faits : ils s'appuient sur des affirmations soutenues.
      const sourced =
        b.type === "fact" || b.type === "definition" ? [b.claim_ids] : b.type === "list" ? b.items.map((i) => i.claim_ids) : [];
      for (const list of sourced) {
        if (list.length === 0) {
          if (b.type === "list") v.fail("list_item_has_claim", "reference", [b.id], "élément de liste sans affirmation sourcée", false);
          else v.fail("fact_has_claim", "reference", [b.id], "bloc factuel sans affirmation sourcée");
        }
        for (const cid of list) {
          const status = claims.get(cid)?.support_status;
          if (status === "unsupported" || status === "contradicted") {
            v.fail("fact_supported", "reference", [b.id, cid], `affirmation ${status === "contradicted" ? "contredite par la source" : "non soutenue"} présentée comme établie`);
          } else if (status === "ambiguous" || status === "partial") {
            v.fail("fact_ambiguous", "reference", [b.id, cid], "affirmation partiellement soutenue ou ambiguë : formulation prudente requise", false);
          }
        }
      }
      if (b.type === "complement" && (b.claim_ids.length > 0 || b.evidence_ids.length > 0)) {
        v.fail("complement_unreferenced", "reference", [b.id], "un complément ne porte pas de référence à la source", false);
      }
    }
  }
  for (const dup of findDuplicates([...ex.sections.map((s) => s.id), ...blockIds])) {
    v.fail("explanation_ids_unique", "reference", [dup], "identifiant dupliqué");
  }
  for (const chk of ex.checks) {
    for (const eid of chk.evidence_ids) {
      if (!evidenceIds.has(eid)) v.fail("check_evidence_exist", "reference", [chk.id, eid], "preuve inexistante");
    }
  }
  for (const g of ex.glossary) {
    for (const cid of g.claim_ids) {
      if (!claims.has(cid)) v.fail("glossary_claims_exist", "reference", [cid], "affirmation inexistante");
    }
  }
}

export function validateBlueprint(
  bp: ReportBlueprint,
  ex: ExplanationObject,
  ko: KnowledgeObject,
  evidenceIds: Set<string>,
  v: ValidationCollector,
) {
  if (bp.explanation_id !== ex.id) {
    v.fail("blueprint_explanation_link", "reference", [bp.id], "explanation_id ne correspond pas");
  }
  const sectionIds = new Set(ex.sections.map((s) => s.id));
  const visualIds = new Set(bp.visual_specs.map((vs) => vs.id));
  const claimIds = new Set(ko.claims.map((c) => c.id));

  for (const s of bp.sections) {
    if (!sectionIds.has(s.section_id)) v.fail("blueprint_section_exists", "reference", [s.section_id], "section inconnue");
    for (const vid of s.visual_ids) {
      if (!visualIds.has(vid)) v.fail("blueprint_visual_exists", "reference", [vid], "visuel inconnu");
    }
  }
  for (const dup of findDuplicates(bp.sections.map((s) => s.section_id))) {
    v.fail("blueprint_section_unique", "reference", [dup], "section placée deux fois");
  }
  for (const vs of bp.visual_specs) {
    for (const cid of vs.claim_ids) {
      if (!claimIds.has(cid)) v.fail("visual_claims_exist", "reference", [vs.id, cid], "affirmation inexistante");
    }
    for (const eid of vs.evidence_ids) {
      if (!evidenceIds.has(eid)) v.fail("visual_evidence_exist", "reference", [vs.id, eid], "preuve inexistante");
    }
  }
  for (const eid of bp.source_index) {
    if (!evidenceIds.has(eid)) v.fail("source_index_exists", "reference", [eid], "preuve inexistante");
  }
}
