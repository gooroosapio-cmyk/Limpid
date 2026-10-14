/**
 * Disposition de la carte mentale (§ 6) : arbre horizontal compact calculé côté client à partir
 * des nœuds publiés, seulement pour les groupes dépliés. Libellés coupés en lignes (texte SVG),
 * aucun dessin bitmap. Fonction pure, testée.
 */
import type { MindMap, MindNode } from "./mindmap";

export const NODE_W = 132;
export const GAP_X = 36;
export const GAP_Y = 12;
export const LINE_H = 15;
export const PAD_Y = 14;
export const CHARS_PER_LINE = 17;
export const MAX_LINES = 3;

export interface PlacedNode {
  node: MindNode;
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  /** Enfants masqués (groupe replié). */
  hidden: number;
  hasChildren: boolean;
}

export interface Layout {
  nodes: PlacedNode[];
  links: { from: string; to: string }[];
  width: number;
  height: number;
}

/** Coupe un libellé en lignes courtes à la frontière des mots (3 lignes au plus). */
export function wrapLabel(label: string, perLine = CHARS_PER_LINE, max = MAX_LINES): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= perLine || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= max) return lines.map((l) => (l.length > perLine + 4 ? `${l.slice(0, perLine + 3)}…` : l));
  const kept = lines.slice(0, max);
  kept[max - 1] = `${kept[max - 1]!.slice(0, perLine - 1)}…`;
  return kept;
}

export function childrenIndex(map: MindMap): Map<string, MindNode[]> {
  const idx = new Map<string, MindNode[]>();
  for (const n of map.nodes) {
    if (!n.parent_id) continue;
    const list = idx.get(n.parent_id) ?? [];
    list.push(n);
    idx.set(n.parent_id, list);
  }
  return idx;
}

/** Ancêtres d'un nœud (du parent jusqu'à la racine). */
export function ancestorsOf(map: MindMap, id: string): string[] {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const out: string[] = [];
  let cur = byId.get(id)?.parent_id ?? null;
  while (cur && !out.includes(cur)) {
    out.push(cur);
    cur = byId.get(cur)?.parent_id ?? null;
  }
  return out;
}

export function layoutTree(map: MindMap, rootId: string, expanded: Set<string>): Layout {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const kids = childrenIndex(map);
  const root = byId.get(rootId);
  const placed: PlacedNode[] = [];
  const links: Layout["links"] = [];
  if (!root) return { nodes: [], links: [], width: 0, height: 0 };
  let cursor = 0;
  const visit = (n: MindNode, depth: number, seen: Set<string>): PlacedNode => {
    seen.add(n.id);
    const lines = wrapLabel(n.label);
    const h = lines.length * LINE_H + PAD_Y;
    const all = (kids.get(n.id) ?? []).filter((c) => !seen.has(c.id));
    const open = expanded.has(n.id);
    const shown = open ? all : [];
    const p: PlacedNode = { node: n, x: depth * (NODE_W + GAP_X), y: 0, w: NODE_W, h, lines, hidden: open ? 0 : all.length, hasChildren: all.length > 0 };
    placed.push(p);
    if (!shown.length) {
      p.y = cursor;
      cursor += h + GAP_Y;
      return p;
    }
    const placedKids = shown.map((c) => {
      links.push({ from: n.id, to: c.id });
      return visit(c, depth + 1, seen);
    });
    const first = placedKids[0]!;
    const last = placedKids[placedKids.length - 1]!;
    p.y = Math.max(0, (first.y + first.h / 2 + last.y + last.h / 2) / 2 - h / 2);
    // Un parent plus haut que ses enfants réunis ne chevauche pas le nœud suivant.
    cursor = Math.max(cursor, p.y + h + GAP_Y);
    return p;
  };
  visit(root, 0, new Set());
  const width = Math.max(...placed.map((p) => p.x + p.w));
  const height = Math.max(...placed.map((p) => p.y + p.h));
  return { nodes: placed, links, width, height };
}
