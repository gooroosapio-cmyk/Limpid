/**
 * Assainissement des SVG générés (Recraft) avant stockage : seuls les éléments et attributs de
 * dessin sont gardés. Aucun script, objet étranger, gestionnaire d'événement, lien externe ni
 * import de style. Le fichier est ensuite servi en `image/svg+xml` avec une CSP « sandbox » et
 * affiché par <img> (aucune exécution possible).
 */

const ALLOWED_TAGS = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "defs", "lineargradient",
  "radialgradient", "stop", "clippath", "mask", "use", "symbol", "title", "desc", "pattern",
]);

const ALLOWED_ATTRS = new Set([
  "xmlns", "xmlns:xlink", "version", "viewbox", "width", "height", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry",
  "d", "points", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin",
  "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "opacity", "transform", "id", "clip-path", "clip-rule", "mask",
  "offset", "stop-color", "stop-opacity", "gradientunits", "gradienttransform", "spreadmethod", "fx", "fy", "fr", "patternunits",
  "patterncontentunits", "patterntransform", "preserveaspectratio", "href", "xlink:href", "class", "style", "maskunits",
  "maskcontentunits", "clippathunits", "vector-effect", "shape-rendering", "color", "display", "visibility",
]);

const MAX_BYTES = 1_500_000;

/** Valeur d'attribut sûre : pas d'URL externe, pas de javascript:, pas d'import. */
function safeValue(name: string, value: string): boolean {
  const v = value.trim().toLowerCase();
  if (/javascript:|vbscript:|data:(?!image\/(png|jpeg|webp);base64,)|@import|expression\(/.test(v)) return false;
  if (name === "href" || name === "xlink:href") return v.startsWith("#");
  // url(#id) seulement (dégradés, masques internes).
  for (const m of v.matchAll(/url\(([^)]*)\)/g)) if (!m[1]!.trim().replace(/['"]/g, "").startsWith("#")) return false;
  return true;
}

export class SvgRejected extends Error {}

/**
 * Renvoie un SVG réduit au dessin, ou lève SvgRejected (trop gros, pas un SVG). Approche par
 * liste blanche : tout élément inconnu est retiré avec son contenu.
 */
export function sanitizeSvg(input: string): string {
  if (input.length > MAX_BYTES) throw new SvgRejected("SVG trop volumineux.");
  let s = input.replace(/<\?xml[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<!DOCTYPE[\s\S]*?>/gi, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  // Blocs dangereux retirés avec leur contenu.
  s = s.replace(/<(script|style|foreignObject|iframe|object|embed|audio|video|image|a|animate\w*|set|handler|listener)\b[\s\S]*?(<\/\1\s*>|\/>)/gi, "");
  s = s.replace(/<(script|style|foreignObject|iframe|object|embed|audio|video|image|a|animate\w*|set|handler|listener)\b[^>]*>/gi, "");
  const out: string[] = [];
  let sawRoot = false;
  const re = /<\/?([a-zA-Z][\w:-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let skipDepth = 0;
  for (const m of s.matchAll(re)) {
    const [whole, rawTag, rawAttrs, selfClose, text] = m;
    if (text !== undefined) {
      if (skipDepth === 0) out.push(text.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, "&amp;"));
      continue;
    }
    const tag = rawTag!.toLowerCase();
    const closing = whole!.startsWith("</");
    if (!ALLOWED_TAGS.has(tag)) {
      if (!selfClose) skipDepth += closing ? -1 : 1;
      if (skipDepth < 0) skipDepth = 0;
      continue;
    }
    if (skipDepth > 0) continue;
    if (closing) {
      out.push(`</${rawTag}>`);
      continue;
    }
    if (tag === "svg") sawRoot = true;
    const attrs: string[] = [];
    for (const a of rawAttrs!.matchAll(/([a-zA-Z][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      const name = a[1]!.toLowerCase();
      const value = a[3] ?? a[4] ?? "";
      if (name.startsWith("on") || !ALLOWED_ATTRS.has(name) || !safeValue(name, value)) continue;
      attrs.push(`${a[1]}="${value.replace(/"/g, "&quot;")}"`);
    }
    out.push(`<${rawTag}${attrs.length ? ` ${attrs.join(" ")}` : ""}${selfClose ? "/" : ""}>`);
  }
  const result = out.join("").trim();
  if (!sawRoot || !/^<svg[\s>]/i.test(result)) throw new SvgRejected("Ce n'est pas un SVG.");
  return result;
}

/** Dimensions d'affichage d'un SVG (viewBox, sinon width/height), bornées pour la base. */
export function svgSize(svg: string): { width: number; height: number } {
  const vb = /viewBox\s*=\s*"[\d.\-]+[\s,]+[\d.\-]+[\s,]+([\d.]+)[\s,]+([\d.]+)"/i.exec(svg);
  const w = Number(vb?.[1] ?? /\bwidth\s*=\s*"([\d.]+)/i.exec(svg)?.[1] ?? 1024);
  const h = Number(vb?.[2] ?? /\bheight\s*=\s*"([\d.]+)/i.exec(svg)?.[1] ?? 768);
  const clamp = (n: number) => Math.min(4096, Math.max(16, Math.round(Number.isFinite(n) ? n : 1024)));
  return { width: clamp(w), height: clamp(h) };
}
