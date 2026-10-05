/**
 * Export PDF d'un rapport (cadrage Q13). Rendu déterministe côté serveur à partir des
 * objets validés : aucun appel IA, aucune ressource externe, police intégrée (Inter, OFL).
 * Même contenu et même numérotation des sources que le lecteur.
 */
import "server-only";
import path from "node:path";
import { Document, Font, Image, Link, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { Evidence, ExplanationObject, ReportBlueprint, SourceSegment, ThemeId, VisualSpec } from "@/lib/contracts/schemas";
import { fr } from "@/lib/i18n/fr";
import { LEVEL_LABELS } from "@/lib/labels";
import { sourceEntries } from "./sources";
import { barRatios, ChartData, ComparisonData, FlowData, IllustrationData, safeHref } from "./visuals";

const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  Font.register({
    family: "Inter",
    fonts: [
      { src: path.join(FONT_DIR, "Inter_400Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "Inter_400Regular_Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
      { src: path.join(FONT_DIR, "Inter_700Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Thème Récit : titres en sérif (le corps reste en Inter complète, pour ne perdre aucun symbole).
  Font.register({
    family: "Source Serif 4",
    fonts: [
      { src: path.join(FONT_DIR, "SourceSerif4_400Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "SourceSerif4_700Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Pas de césure automatique (règles anglaises par défaut, fausses en français) ; seules les
  // chaînes très longues (adresses, crédits) sont coupées pour ne pas sortir de la page.
  Font.registerHyphenationCallback((word) => (word.length > 40 ? (word.match(/.{1,30}/g) ?? [word]) : [word]));
  fontsReady = true;
}

const C = { ivoire: "#F7F6F2", encre: "#20211F", jaune: "#F2D94E", jauneDoux: "#FAEFB4", vert: "#396451", gris: "#61655E", bordure: "#DCDAD2" };

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 10.5, lineHeight: 1.5, color: C.encre, paddingTop: 48, paddingBottom: 56, paddingHorizontal: 52 },
  brand: { fontSize: 9, fontWeight: 700, color: C.gris, marginBottom: 14 },
  badges: { flexDirection: "row", gap: 6, marginBottom: 8 },
  badge: { fontSize: 8, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8, backgroundColor: C.jauneDoux },
  badgeDemo: { fontSize: 8, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8, backgroundColor: C.encre, color: C.ivoire },
  title: { fontSize: 22, fontWeight: 700, lineHeight: 1.2, marginBottom: 14 },
  meta: { fontSize: 9, color: C.gris, marginBottom: 16 },
  boxTitle: { fontWeight: 700, marginBottom: 4 },
  h2: { fontSize: 14, fontWeight: 700, lineHeight: 1.25, marginTop: 14, marginBottom: 8 },
  p: { marginBottom: 8 },
  li: { flexDirection: "row", marginBottom: 3 },
  bullet: { width: 12 },
  liText: { flex: 1 },
  label: { fontSize: 8, fontWeight: 700, color: C.vert, textTransform: "uppercase", marginBottom: 2 },
  block: { marginBottom: 8 },
  muted: { color: C.gris },
  italic: { fontStyle: "italic" },
  ref: { fontSize: 7, color: C.vert },
  toc: { borderWidth: 1, borderColor: C.bordure, borderRadius: 8, padding: 10, marginBottom: 8 },
  flow: { alignItems: "center", marginVertical: 8 },
  flowBox: { borderWidth: 1, borderColor: C.encre, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 10, width: 220, backgroundColor: "#FFFFFF" },
  flowLabel: { textAlign: "center" },
  arrow: { fontSize: 11, color: C.gris, marginVertical: 1 },
  caption: { fontSize: 9, color: C.gris, textAlign: "center", marginTop: 4 },
  check: { borderWidth: 1, borderColor: C.bordure, borderRadius: 8, padding: 10, marginBottom: 8 },
  source: { fontSize: 9, marginBottom: 6 },
  // Ancré par le haut (A4 = 842 pt) : avec un interligne hérité, react-pdf n'affiche pas
  // un texte dynamique ancré par le bas.
  footer: { position: "absolute", top: 806, left: 52, right: 52, fontSize: 8, color: C.gris },
});

/** Présentation : couleurs, encadrés et titres ; le texte, l'ordre et les sources sont identiques. */
type ThemeStyle = {
  page: Style;
  takeaway: Style;
  boxed: Style;
  caution: Style;
  definition: Style;
  heading: Style;
  bar: string;
  illustrations: boolean;
};
const BASE_HEADING: Style = {};
const THEME_STYLES: Record<ThemeId, ThemeStyle> = {
  sciences: {
    page: { backgroundColor: C.ivoire },
    takeaway: { backgroundColor: C.jauneDoux, borderRadius: 8, padding: 12, marginBottom: 16 },
    boxed: { borderLeftWidth: 3, borderLeftColor: C.jaune, paddingLeft: 8, marginBottom: 8 },
    caution: { borderLeftWidth: 3, borderLeftColor: "#A23B2A", paddingLeft: 8, marginBottom: 8 },
    definition: { marginBottom: 8 },
    heading: BASE_HEADING,
    bar: C.jaune,
    illustrations: true,
  },
  recit: {
    page: { backgroundColor: "#F4F0E6" },
    takeaway: { borderTopWidth: 3, borderTopColor: "#976544", paddingTop: 10, marginBottom: 16 },
    boxed: { borderLeftWidth: 3, borderLeftColor: "#976544", paddingLeft: 8, marginBottom: 8 },
    caution: { borderLeftWidth: 3, borderLeftColor: C.encre, paddingLeft: 8, marginBottom: 8 },
    definition: { marginBottom: 8 },
    heading: { fontFamily: "Source Serif 4" },
    bar: "#976544",
    illustrations: true,
  },
  dossier: {
    page: { backgroundColor: "#FFFFFF" },
    takeaway: { borderWidth: 1, borderColor: C.bordure, borderTopWidth: 3, borderTopColor: C.vert, padding: 12, marginBottom: 16 },
    boxed: { borderLeftWidth: 2, borderLeftColor: C.bordure, paddingLeft: 8, marginBottom: 8 },
    caution: { borderLeftWidth: 2, borderLeftColor: C.encre, paddingLeft: 8, marginBottom: 8 },
    definition: { marginBottom: 8 },
    heading: { color: C.vert },
    bar: C.vert,
    illustrations: false,
  },
  guide: {
    page: { backgroundColor: "#FFFFFF" },
    takeaway: { backgroundColor: C.jauneDoux, borderRadius: 8, padding: 12, marginBottom: 16 },
    boxed: { backgroundColor: C.jauneDoux, borderRadius: 6, padding: 8, marginBottom: 8 },
    caution: { backgroundColor: "#E8EFE8", borderLeftWidth: 4, borderLeftColor: C.vert, borderRadius: 6, padding: 8, marginBottom: 8 },
    definition: { borderLeftWidth: 3, borderLeftColor: C.vert, paddingLeft: 8, marginBottom: 8 },
    heading: BASE_HEADING,
    bar: C.encre,
    illustrations: true,
  },
  confort: {
    page: { backgroundColor: "#FFFFFF", fontSize: 12.5, lineHeight: 1.6 },
    takeaway: { backgroundColor: C.jauneDoux, borderRadius: 8, padding: 14, marginBottom: 18 },
    boxed: { borderLeftWidth: 3, borderLeftColor: C.jaune, paddingLeft: 10, marginBottom: 10 },
    caution: { borderLeftWidth: 3, borderLeftColor: C.encre, paddingLeft: 10, marginBottom: 10 },
    definition: { marginBottom: 10 },
    heading: { fontSize: 16 },
    bar: C.jaune,
    illustrations: true,
  },
};

/** Image d'illustration déjà vérifiée (type, taille, dimensions), avec son crédit en texte. */
export interface PdfImage {
  data: Buffer;
  format: "png" | "jpg";
  width: number;
  height: number;
  credit: string;
}

type Block = ExplanationObject["sections"][number]["blocks"][number];

function Refs({ ids, numbers }: { ids: string[]; numbers: Map<string, number> }) {
  const ns = ids.map((id) => numbers.get(id)).filter((n): n is number => !!n);
  return ns.length ? <Text style={s.ref}> [{ns.join(", ")}]</Text> : null;
}

function Bullets({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((t, i) => (
        <View key={i} style={s.li} wrap={false}>
          <Text style={s.bullet}>•</Text>
          <Text style={s.liText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function BlockPdf({ block, numbers, t }: { block: Block; numbers: Map<string, number>; t: ThemeStyle }) {
  const refs = <Refs ids={block.evidence_ids} numbers={numbers} />;
  switch (block.type) {
    case "fact":
      return <Text style={s.p}>{block.text}{refs}</Text>;
    case "definition":
      return (
        <View style={t.definition}>
          <Text style={s.label}>{fr.reader.definition}</Text>
          <Text><Text style={{ fontWeight: 700 }}>{block.term}</Text> — {block.text}{refs}</Text>
        </View>
      );
    case "analogy":
      return (
        <View style={t.boxed}>
          <Text style={s.label}>{fr.reader.analogy}</Text>
          <Text style={s.p}>{block.text}</Text>
          <Text style={s.muted}><Text style={{ fontWeight: 700 }}>{fr.reader.analogyLimit}</Text> {block.limit}</Text>
        </View>
      );
    case "fictional_example":
      return (
        <View style={t.boxed}>
          <Text style={s.label}>{fr.reader.fictional}</Text>
          <Text style={s.italic}>{block.text}</Text>
        </View>
      );
    case "inference":
      return (
        <View style={s.block}>
          <Text style={s.label}>{fr.reader.inference}</Text>
          <Text>{block.text}{refs}</Text>
        </View>
      );
    case "caution":
      return (
        <View style={t.caution}>
          <Text style={s.label}>{fr.reader.caution}</Text>
          <Text>{block.text}{refs}</Text>
        </View>
      );
  }
}

function FlowPdf({ data }: { data: FlowData }) {
  return (
    <View style={s.flow}>
      {data.steps.map((step, i) => (
        <View key={i} style={{ alignItems: "center" }}>
          {i > 0 && <Text style={s.arrow}>↓</Text>}
          <View style={s.flowBox}>
            <Text style={s.flowLabel}>{step.label}</Text>
          </View>
        </View>
      ))}
      {data.cyclic && <Text style={s.caption}>↺ puis le cycle recommence</Text>}
    </View>
  );
}

function ChartPdf({ data, color }: { data: ChartData; color: string }) {
  const ratios = barRatios(data.bars.map((b) => b.value));
  return (
    <View style={{ marginVertical: 8 }}>
      {data.bars.map((b, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
          <Text style={{ width: 120, textAlign: "right", paddingRight: 6 }}>{b.label}</Text>
          <View style={{ width: Math.max(2, ratios[i]! * 220), height: 12, backgroundColor: color, borderRadius: 2 }} />
          <Text style={{ paddingLeft: 6, fontWeight: 700 }}>{b.source_form}</Text>
        </View>
      ))}
    </View>
  );
}

function ComparisonPdf({ data }: { data: ComparisonData }) {
  const cell = { flex: 1, padding: 4, borderBottomWidth: 0.5, borderBottomColor: C.bordure };
  return (
    <View style={{ marginVertical: 8 }}>
      <View style={{ flexDirection: "row" }}>
        <Text style={cell} />
        {data.criteria.map((c) => <Text key={c} style={[cell, { fontWeight: 700 }]}>{c}</Text>)}
      </View>
      {data.options.map((o) => (
        <View key={o.name} style={{ flexDirection: "row" }} wrap={false}>
          <Text style={[cell, { fontWeight: 700 }]}>{o.name}</Text>
          {data.criteria.map((c, i) => (
            <Text key={c} style={[cell, o.cells[i]?.text ? {} : s.muted]}>{o.cells[i]?.text ?? fr.visuals.notStated}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function VisualPdf({ v, numbers, t, images }: { v: VisualSpec; numbers: Map<string, number>; t: ThemeStyle; images: Record<string, PdfImage> }) {
  const caption = <Text style={s.caption}>{v.caption}<Refs ids={v.evidence_ids} numbers={numbers} /></Text>;
  const alt = <Text style={[s.caption, s.italic]}>{fr.reader.textAlternative} : {v.alt_text}</Text>;
  if (v.kind === "flow") {
    const d = FlowData.safeParse(v.data);
    return d.success ? <View wrap={false}><FlowPdf data={d.data} />{caption}{alt}</View> : null;
  }
  if (v.kind === "bar_chart") {
    const d = ChartData.safeParse(v.data);
    return d.success ? <View wrap={false}><ChartPdf data={d.data} color={t.bar} />{caption}{alt}</View> : null;
  }
  if (v.kind === "comparison_table") {
    const d = ComparisonData.safeParse(v.data);
    return d.success ? <View><ComparisonPdf data={d.data} />{caption}</View> : null;
  }
  if (v.kind === "illustration" && t.illustrations) {
    const d = IllustrationData.safeParse(v.data);
    const img = d.success && d.data.asset_id ? images[d.data.asset_id] : undefined;
    if (!img) return null;
    const width = 300;
    return (
      <View wrap={false} style={{ alignItems: "center", marginVertical: 8 }}>
        <Image src={{ data: img.data, format: img.format }} style={{ width, height: Math.round((width * img.height) / img.width) }} />
        <Text style={s.caption}>{fr.visuals.illustration} : {v.caption}</Text>
        <Text style={[s.caption, { fontSize: 7.5 }]}>{img.credit}</Text>
      </View>
    );
  }
  return null;
}

export interface PdfReportInput {
  blueprint: ReportBlueprint;
  explanation: ExplanationObject;
  evidence: Evidence[];
  segments: SourceSegment[];
  sourceTitle: string;
  sourceUrl?: string | null;
  isDemo?: boolean;
  /** Remarques de couverture partielle. */
  notes?: string[];
  /** Couverture partielle (sinon remarques informatives, ex. lecture OCR). */
  partial?: boolean;
  generatedAt?: Date;
  theme?: ThemeId;
  /** Illustrations par identifiant d'actif (celles servies par un hébergeur tiers en sont exclues). */
  images?: Record<string, PdfImage>;
}

function ReportDocument(input: PdfReportInput) {
  const { blueprint, explanation } = input;
  const t = THEME_STYLES[input.theme ?? "sciences"];
  const { numbers, entries } = sourceEntries(blueprint, input.evidence, input.segments);
  const sections = new Map(explanation.sections.map((x) => [x.id, x]));
  const visuals = new Map(blueprint.visual_specs.map((v) => [v.id, v]));
  const date = (input.generatedAt ?? new Date()).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const ordered = blueprint.sections.flatMap((bs) => {
    const sec = sections.get(bs.section_id);
    return sec ? [{ bs, sec }] : [];
  });

  return (
    <Document title={blueprint.title} author="Limpid" creator="Limpid" producer="Limpid" language="fr">
      <Page size="A4" style={[s.page, t.page]}>
        <Text style={s.brand}>limpid</Text>
        <View style={s.badges}>
          {input.isDemo && <Text style={s.badgeDemo}>{fr.demo.badge}</Text>}
          <Text style={s.badge}>{LEVEL_LABELS[explanation.level]}</Text>
        </View>
        <Text style={[s.title, t.heading]}>{blueprint.title}</Text>
        <Text style={s.meta}>D'après : {input.sourceTitle} · {date}</Text>

        {input.notes && input.notes.length > 0 && (
          <View style={t.caution}>
            <Text style={s.label}>{input.partial === false ? fr.reader.aboutSource : fr.reader.partialCoverage}</Text>
            <Bullets items={input.notes} />
          </View>
        )}

        <View style={t.takeaway} wrap={false}>
          <Text style={s.boxTitle}>{fr.reader.essential}</Text>
          <Bullets items={explanation.sections.map((x) => x.takeaway)} />
        </View>

        <View style={s.toc}>
          <Text style={s.boxTitle}>{fr.reader.toc}</Text>
          {ordered.map(({ sec }, i) => <Text key={sec.id}>{i + 1}. {sec.question}</Text>)}
        </View>

        {ordered.map(({ bs, sec }, i) => (
          <View key={sec.id}>
            {/* Le titre reste avec son premier bloc : jamais seul en bas de page. */}
            <View wrap={false}>
              <Text style={[s.h2, t.heading]}>{i + 1}. {sec.question}</Text>
              {sec.blocks[0] && <BlockPdf block={sec.blocks[0]} numbers={numbers} t={t} />}
            </View>
            {sec.blocks.slice(1).map((b) => <BlockPdf key={b.id} block={b} numbers={numbers} t={t} />)}
            {bs.visual_ids.map((vid) => {
              const v = visuals.get(vid);
              return v ? <VisualPdf key={v.id} v={v} numbers={numbers} t={t} images={input.images ?? {}} /> : null;
            })}
          </View>
        ))}

        {explanation.glossary.length > 0 && (
          <View>
            <Text style={[s.h2, t.heading]} minPresenceAhead={110}>{fr.reader.glossary}</Text>
            {explanation.glossary.map((g) => (
              <Text key={g.term} style={s.p}><Text style={{ fontWeight: 700 }}>{g.term}</Text> — {g.definition}</Text>
            ))}
          </View>
        )}

        {explanation.checks.length > 0 && (
          <View>
            <Text style={[s.h2, t.heading]} minPresenceAhead={110}>{fr.reader.check}</Text>
            {explanation.checks.map((c) => (
              <View key={c.id} style={s.check} wrap={false}>
                <Text style={[s.p, { fontWeight: 700 }]}>{c.question}</Text>
                <Text style={s.label}>Éléments de réponse</Text>
                <Bullets items={c.expected_points} />
                <Refs ids={c.evidence_ids} numbers={numbers} />
              </View>
            ))}
          </View>
        )}

        {explanation.limitations.length > 0 && (
          <View>
            <Text style={[s.h2, t.heading]} minPresenceAhead={110}>{fr.reader.limits}</Text>
            <Bullets items={explanation.limitations} />
          </View>
        )}

        <View>
          <Text style={[s.h2, t.heading]} minPresenceAhead={110}>{fr.reader.sources}</Text>
          <Text style={[s.p, s.muted]}>
            {input.sourceTitle}
            {safeHref(input.sourceUrl) ? <Text> — <Link src={safeHref(input.sourceUrl)!}>{input.sourceUrl}</Link></Text> : null}
          </Text>
          {entries.map((e) => (
            <Text key={e.evidenceId} style={s.source}>
              <Text style={{ fontWeight: 700 }}>[{e.n}]</Text> {e.location} — « {e.quote} »
            </Text>
          ))}
        </View>

        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Limpid · explication générée par IA, vérifiez les sources citées · page ${pageNumber} / ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}

export async function renderReportPdf(input: PdfReportInput): Promise<Buffer> {
  registerFonts();
  try {
    return await renderToBuffer(<ReportDocument {...input} />);
  } catch (e) {
    // Une illustration illisible ne bloque pas l'export : le texte, les schémas et les sources restent.
    if (!input.images || Object.keys(input.images).length === 0) throw e;
    return renderToBuffer(<ReportDocument {...input} images={{}} />);
  }
}

/** Nom de fichier sûr à partir du titre (ASCII pour l'en-tête, UTF-8 encodé en complément). */
export function pdfFileName(title: string): { ascii: string; utf8: string } {
  const base = title.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "rapport";
  const ascii = base.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, "-") || "rapport";
  return { ascii: `limpid-${ascii}.pdf`, utf8: `Limpid - ${base}.pdf` };
}

export function pdfHeaders(title: string): HeadersInit {
  const name = pdfFileName(title);
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${name.ascii}"; filename*=UTF-8''${encodeURIComponent(name.utf8)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}
