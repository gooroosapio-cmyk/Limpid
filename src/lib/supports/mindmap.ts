/**
 * Carte mentale (§ 6 et § 12) : arborescence cours → chapitres (posée par le code) → notions et
 * groupes (produits par le moteur), plus des liens transversaux typés. Le backend produit nœuds
 * et relations ; le lecteur dispose, dessine et anime. Contrôles : identifiants, références,
 * parents (aucun cycle parental), relations cohérentes, libellés courts.
 */
import { z } from "zod";
import { assignColors, COLOR_KEYS, type ColorKey } from "./colors";

/** Liens transversaux (la relation « contient » est la hiérarchie elle-même). */
export const RELATIONS = ["necessite", "precede", "cause", "explique", "oppose", "applique_si"] as const;
export type Relation = (typeof RELATIONS)[number];
export const NODE_KINDS = ["groupe", "notion", "etape", "exemple", "formule"] as const;

/** Longueur maximale d'un libellé de nœud (le détail reste dans le panneau de notion). */
export const LABEL_MAX = 48;
/** Nœuds produits au plus par chapitre (vue lisible sur téléphone). */
export const NODES_PER_CHAPTER = 18;

const text = (max: number) => z.string().trim().min(1).max(max);

export const MindMapDraft = z.strictObject({
  chapters: z
    .array(
      z.strictObject({
        chapter_id: text(80),
        /** Libellé court du chapitre dans la carte (sinon son titre). */
        label: z.string().trim().max(80).nullable(),
        nodes: z
          .array(
            z.strictObject({
              key: z.string().trim().regex(/^[a-z0-9_]{1,30}$/),
              label: text(90),
              /** null : rattaché directement au chapitre. */
              parent_key: z.string().trim().max(30).nullable(),
              kind: z.enum(NODE_KINDS),
              /** Notion du glossaire représentée (panneau de notion), ou null. */
              concept_term: z.string().trim().max(80).nullable(),
              /** Détail court affiché dans le panneau (jamais dans le nœud). */
              detail: z.string().trim().max(400).nullable(),
              evidence_ids: z.array(text(80)).max(6),
            }),
          )
          .max(30),
        edges: z
          .array(
            z.strictObject({
              from_key: z.string().trim().max(30),
              to_key: z.string().trim().max(30),
              relation: z.enum(RELATIONS),
              label: z.string().trim().max(40).nullable(),
              evidence_ids: z.array(text(80)).max(6),
            }),
          )
          .max(20),
      }),
    )
    .max(12),
});
export type MindMapDraft = z.infer<typeof MindMapDraft>;

export const MindNode = z.strictObject({
  id: z.string(),
  parent_id: z.string().nullable(),
  label: z.string(),
  kind: z.enum(["racine", "chapitre", ...NODE_KINDS]),
  chapter_id: z.string().nullable(),
  concept_term: z.string().nullable(),
  detail: z.string().nullable(),
  evidence_ids: z.array(z.string()),
  color: z.enum(COLOR_KEYS),
  depth: z.number().int().min(0),
});
export type MindNode = z.infer<typeof MindNode>;

export const MindEdge = z.strictObject({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  relation: z.enum(RELATIONS),
  label: z.string().nullable(),
  evidence_ids: z.array(z.string()),
});
export type MindEdge = z.infer<typeof MindEdge>;

export const MindMap = z.strictObject({
  schema: z.literal(1),
  nodes: z.array(MindNode).max(800),
  edges: z.array(MindEdge).max(400),
});
export type MindMap = z.infer<typeof MindMap>;

export interface MapContext {
  title: string;
  chapters: { id: string; title: string }[];
  evidenceIds: Set<string>;
  terms: Set<string>;
}

export interface MapIssues {
  dropped: { reason: string; item: string }[];
  shortened: string[];
}

/** Libellé court à la frontière d'un mot (le texte complet reste dans le détail). */
export function shortLabel(label: string, max = LABEL_MAX): string {
  const clean = label.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:.–-]+$/, "")}…`;
}

/** Parents valides : chaque chaîne remonte jusqu'au chapitre sans boucle. */
function resolveParents(nodes: MindMapDraft["chapters"][number]["nodes"], issues: MapIssues, chapterId: string): Map<string, string | null> {
  const keys = new Set(nodes.map((n) => n.key));
  const parent = new Map<string, string | null>();
  for (const n of nodes) {
    const p = n.parent_key && keys.has(n.parent_key) && n.parent_key !== n.key ? n.parent_key : null;
    if (n.parent_key && !p) issues.dropped.push({ reason: "parent inconnu : rattaché au chapitre", item: `${chapterId}/${n.key}` });
    parent.set(n.key, p);
  }
  // Cycle parental : le nœud qui ferme la boucle est rattaché au chapitre.
  for (const k of parent.keys()) {
    const seen = new Set<string>();
    let cur: string | null = k;
    while (cur) {
      if (seen.has(cur)) {
        issues.dropped.push({ reason: "cycle parental rompu", item: `${chapterId}/${cur}` });
        parent.set(cur, null);
        break;
      }
      seen.add(cur);
      cur = parent.get(cur) ?? null;
    }
  }
  return parent;
}

export function buildMindMap(drafts: MindMapDraft[], ctx: MapContext, seed: string, previous?: MindMap | null): { map: MindMap; issues: MapIssues } {
  const issues: MapIssues = { dropped: [], shortened: [] };
  const byChapter = new Map<string, MindMapDraft["chapters"][number]>();
  for (const d of drafts) for (const c of d.chapters) if (!byChapter.has(c.chapter_id)) byChapter.set(c.chapter_id, c);
  for (const id of byChapter.keys()) if (!ctx.chapters.some((c) => c.id === id)) issues.dropped.push({ reason: "chapitre inconnu", item: id });

  // Une couleur par branche principale (chapitre), conservée d'une version à l'autre.
  const prevColors = new Map((previous?.nodes ?? []).filter((n) => n.kind === "chapitre").map((n) => [n.id, n.color as ColorKey]));
  const colors = assignColors(ctx.chapters.map((c) => `ch:${c.id}`), seed, prevColors);
  const nodes: MindNode[] = [
    { id: "root", parent_id: null, label: shortLabel(ctx.title, 60), kind: "racine", chapter_id: null, concept_term: null, detail: null, evidence_ids: [], color: "jaune", depth: 0 },
  ];
  const edges: MindEdge[] = [];
  const evid = (ids: string[]) => [...new Set(ids.filter((e) => ctx.evidenceIds.has(e)))];
  for (const ch of ctx.chapters) {
    const chId = `ch:${ch.id}`;
    const color = colors.get(chId)!;
    const draft = byChapter.get(ch.id);
    const label = draft?.label || ch.title;
    nodes.push({ id: chId, parent_id: "root", label: shortLabel(label), kind: "chapitre", chapter_id: ch.id, concept_term: null, detail: label.length > LABEL_MAX ? label : null, evidence_ids: [], color, depth: 1 });
    if (!draft) continue;
    const list = draft.nodes.slice(0, NODES_PER_CHAPTER);
    if (draft.nodes.length > NODES_PER_CHAPTER) issues.dropped.push({ reason: `plus de ${NODES_PER_CHAPTER} nœuds`, item: ch.id });
    const parent = resolveParents(list, issues, ch.id);
    const idOf = (k: string) => `n:${ch.id}:${k}`;
    const depthOf = (k: string): number => {
      let d = 2;
      let p = parent.get(k) ?? null;
      while (p) {
        d++;
        p = parent.get(p) ?? null;
      }
      return d;
    };
    for (const n of list) {
      const short = shortLabel(n.label);
      if (short !== n.label.trim()) issues.shortened.push(idOf(n.key));
      const term = n.concept_term && ctx.terms.has(n.concept_term.toLowerCase()) ? n.concept_term : null;
      const p = parent.get(n.key) ?? null;
      nodes.push({
        id: idOf(n.key),
        parent_id: p ? idOf(p) : chId,
        label: short,
        kind: n.kind,
        chapter_id: ch.id,
        concept_term: term,
        detail: n.detail ?? (short !== n.label.trim() ? n.label.trim() : null),
        evidence_ids: evid(n.evidence_ids),
        color,
        depth: depthOf(n.key),
      });
    }
    const keys = new Set(list.map((n) => n.key));
    const seenEdge = new Set<string>();
    for (const e of draft.edges) {
      if (!keys.has(e.from_key) || !keys.has(e.to_key) || e.from_key === e.to_key) {
        issues.dropped.push({ reason: "relation vers un nœud absent", item: `${ch.id}/${e.from_key}->${e.to_key}` });
        continue;
      }
      // Une relation qui répète le lien parent-enfant n'apporte rien.
      if (parent.get(e.to_key) === e.from_key || parent.get(e.from_key) === e.to_key) continue;
      const k = `${e.from_key}|${e.to_key}|${e.relation}`;
      if (seenEdge.has(k)) continue;
      seenEdge.add(k);
      edges.push({ id: `e:${ch.id}:${edges.length + 1}`, from: idOf(e.from_key), to: idOf(e.to_key), relation: e.relation, label: e.label || null, evidence_ids: evid(e.evidence_ids) });
    }
  }
  return { map: { schema: 1, nodes, edges }, issues };
}

/** Enfants directs d'un nœud (dans l'ordre de la carte). */
export function childrenOf(map: MindMap, id: string): MindNode[] {
  return map.nodes.filter((n) => n.parent_id === id);
}
