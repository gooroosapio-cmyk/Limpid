/**
 * Extraction du contenu principal d'une page web : Readability isole l'article, puis le
 * DOM est parcouru en blocs (titres, paragraphes, éléments de liste, cellules). Aucun
 * script n'est exécuté : linkedom construit un DOM inerte.
 */
import "server-only";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { ExtractionError, type TextBlock } from "./text";

const HEADINGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
const LEAVES = new Set(["P", "LI", "BLOCKQUOTE", "PRE", "FIGCAPTION", "TD", "TH", "DT", "DD", "CAPTION", "ADDRESS"]);
const CONTAINERS = new Set([
  "HTML", "BODY", "DIV", "SECTION", "ARTICLE", "MAIN", "UL", "OL", "TABLE", "TBODY", "THEAD", "TFOOT", "TR",
  "FIGURE", "HEADER", "FOOTER", "DL", "DETAILS", "SUMMARY", "HGROUP", "CENTER",
]);
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "IFRAME", "OBJECT", "EMBED", "CANVAS",
  "BUTTON", "INPUT", "SELECT", "TEXTAREA", "FORM", "NAV", "ASIDE"]);
const BLOCK_SELECTOR = [...HEADINGS, ...LEAVES, ...CONTAINERS].map((t) => t.toLowerCase()).join(",");

interface NodeLike {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<NodeLike>;
  querySelector?: (s: string) => unknown;
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Parcourt un sous-arbre et produit des blocs, en regroupant le texte « en vrac » des conteneurs. */
export function blocksFromDom(root: NodeLike): TextBlock[] {
  const out: TextBlock[] = [];
  let loose = "";
  const flush = () => {
    const t = clean(loose);
    if (t) out.push({ text: t });
    loose = "";
  };
  const elements = (node: NodeLike) => Array.from(node.childNodes).filter((c) => c.nodeType === 1);
  const isLeaf = (el: NodeLike) => !el.querySelector?.(BLOCK_SELECTOR);
  const visit = (node: NodeLike) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        loose += child.textContent ?? "";
        continue;
      }
      if (child.nodeType !== 1) continue;
      const tag = child.nodeName.toUpperCase();
      if (SKIP.has(tag)) continue;
      if (HEADINGS.has(tag)) {
        flush();
        const t = clean(child.textContent);
        if (t) out.push({ text: t, heading: true });
      } else if (tag === "TR") {
        // Une ligne de tableau = un bloc : « cellule | cellule | … ».
        flush();
        const cells = elements(child).map((c) => clean(c.textContent)).filter(Boolean);
        if (cells.length) out.push({ text: cells.join(" | ") });
      } else if ((tag === "UL" || tag === "OL") && elements(child).every((li) => li.nodeName.toUpperCase() !== "LI" || isLeaf(li))) {
        // Liste simple : un seul bloc, éléments séparés par des points-virgules.
        flush();
        const items = elements(child).map((li) => clean(li.textContent)).filter(Boolean);
        if (items.length) out.push({ text: items.map((t) => (/[.!?…;:]$/.test(t) ? t : `${t} ;`)).join(" ").replace(/ ;$/, ".") });
      } else if (LEAVES.has(tag) && isLeaf(child)) {
        flush();
        const t = clean(child.textContent);
        if (t) out.push({ text: t });
      } else if (LEAVES.has(tag) || CONTAINERS.has(tag)) {
        flush();
        visit(child);
        flush();
      } else if (tag === "BR") {
        loose += " ";
      } else {
        // Élément en ligne (a, em, span…) : son texte rejoint le paragraphe en cours.
        loose += child.textContent ?? "";
      }
    }
  };
  visit(root);
  flush();
  return out;
}

/** Décode le corps HTML selon le jeu de caractères annoncé (en-tête, puis balise meta). */
export function decodeHtml(body: Uint8Array, headerCharset: string | null): string {
  const head = new TextDecoder("latin1").decode(body.slice(0, 4096));
  const meta = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1] ?? null;
  for (const label of [headerCharset, meta, "utf-8"]) {
    if (!label) continue;
    try {
      return new TextDecoder(label.toLowerCase()).decode(body);
    } catch {
      // Jeu de caractères inconnu : on essaie le suivant.
    }
  }
  return new TextDecoder().decode(body);
}

export interface HtmlArticle {
  title: string | null;
  blocks: TextBlock[];
}

/** Éléments sans valeur pour la compréhension : menus, pieds de page, notes, encadrés de navigation. */
const NOISE = [
  "script", "style", "noscript", "template", "nav", "aside", "footer", "form", "dialog",
  "[role=navigation]", "[role=banner]", "[role=contentinfo]", "[role=complementary]", "[aria-hidden=true]", "[hidden]",
  ".navbox", ".mw-editsection", ".mw-jump-link", "sup.reference", ".references", ".reflist", ".mw-references-wrap",
  ".noprint", ".metadata", ".catlinks", ".printfooter", "#toc", ".toc", ".sr-only", ".visually-hidden", ".cookie", ".newsletter", ".share",
].join(",");

/** Zones principales déclarées par la page, de la plus précise à la plus large. */
const MAIN_SELECTORS = ["#mw-content-text", "article", "main", "[role=main]", "#content", "#main"];

const textLength = (blocks: TextBlock[]) => blocks.reduce((n, b) => n + b.text.length, 0);

type Doc = ReturnType<typeof parseHTML>["document"];

function cleanDocument(html: string): Doc {
  const { document } = parseHTML(html);
  for (const el of Array.from(document.querySelectorAll(NOISE))) (el as unknown as { remove(): void }).remove();
  return document;
}

/**
 * Stratégie : zone principale sémantique (article, main…) si elle contient assez de texte ;
 * sinon Readability (pages sans balisage sémantique) ; sinon le corps nettoyé de la page.
 */
export function extractHtml(html: string): HtmlArticle {
  const document = cleanDocument(html);
  const pageTitle = clean(document.title) || clean(document.querySelector("h1")?.textContent) || null;

  for (const sel of MAIN_SELECTORS) {
    const matches = Array.from(document.querySelectorAll(sel));
    // Plusieurs <article> (page de liste) : ce n'est pas un article unique.
    if (matches.length !== 1) continue;
    const blocks = blocksFromDom(matches[0] as unknown as NodeLike);
    if (textLength(blocks) >= 500) return { title: pageTitle, blocks };
  }

  try {
    // Readability travaille sur son propre exemplaire du document (il le modifie).
    const article = new Readability<NodeLike>(cleanDocument(html) as unknown as Document, {
      serializer: (n) => n as unknown as NodeLike,
      charThreshold: 300,
    }).parse();
    if (article?.content) {
      const blocks = blocksFromDom(article.content);
      if (textLength(blocks) >= 200) return { title: clean(article.title) || pageTitle, blocks };
    }
  } catch {
    // Page atypique : repli sur le corps.
  }

  const blocks = document.body ? blocksFromDom(document.body as unknown as NodeLike) : [];
  if (blocks.length === 0) throw new ExtractionError("empty", "Aucun texte lisible n'a été trouvé sur cette page.");
  return { title: pageTitle, blocks };
}
