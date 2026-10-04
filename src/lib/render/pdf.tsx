/**
 * Export PDF d'un rapport (cadrage Q13). Rendu déterministe côté serveur à partir des
 * objets validés : aucun appel IA, aucune ressource externe, police intégrée (Inter, OFL).
 * Même contenu et même numérotation des sources que le lecteur.
 */
import "server-only";
import path from "node:path";
import { Document, Font, Link, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Evidence, ExplanationObject, ReportBlueprint, SourceSegment } from "@/lib/contracts/schemas";
import { fr } from "@/lib/i18n/fr";
import { LEVEL_LABELS } from "@/lib/labels";
import { sourceEntries } from "./sources";
import { FlowData } from "./visuals";

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
  // Pas de césure automatique (règles anglaises par défaut, fausses en français).
  Font.registerHyphenationCallback((word) => [word]);
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
  takeaway: { backgroundColor: C.jauneDoux, borderRadius: 8, padding: 12, marginBottom: 16 },
  boxTitle: { fontWeight: 700, marginBottom: 4 },
  h2: { fontSize: 14, fontWeight: 700, lineHeight: 1.25, marginTop: 14, marginBottom: 8 },
  p: { marginBottom: 8 },
  li: { flexDirection: "row", marginBottom: 3 },
  bullet: { width: 12 },
  liText: { flex: 1 },
  label: { fontSize: 8, fontWeight: 700, color: C.vert, textTransform: "uppercase", marginBottom: 2 },
  block: { marginBottom: 8 },
  boxed: { borderLeftWidth: 3, borderLeftColor: C.jaune, paddingLeft: 8, marginBottom: 8 },
  caution: { borderLeftWidth: 3, borderLeftColor: "#A23B2A", paddingLeft: 8, marginBottom: 8 },
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

function BlockPdf({ block, numbers }: { block: Block; numbers: Map<string, number> }) {
  const refs = <Refs ids={block.evidence_ids} numbers={numbers} />;
  switch (block.type) {
    case "fact":
      return <Text style={s.p}>{block.text}{refs}</Text>;
    case "definition":
      return (
        <View style={s.block}>
          <Text style={s.label}>{fr.reader.definition}</Text>
          <Text><Text style={{ fontWeight: 700 }}>{block.term}</Text> — {block.text}{refs}</Text>
        </View>
      );
    case "analogy":
      return (
        <View style={s.boxed}>
          <Text style={s.label}>{fr.reader.analogy}</Text>
          <Text style={s.p}>{block.text}</Text>
          <Text style={s.muted}><Text style={{ fontWeight: 700 }}>{fr.reader.analogyLimit}</Text> {block.limit}</Text>
        </View>
      );
    case "fictional_example":
      return (
        <View style={s.boxed}>
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
        <View style={s.caution}>
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
  generatedAt?: Date;
}

function ReportDocument(input: PdfReportInput) {
  const { blueprint, explanation } = input;
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
      <Page size="A4" style={s.page}>
        <Text style={s.brand}>limpid</Text>
        <View style={s.badges}>
          {input.isDemo && <Text style={s.badgeDemo}>{fr.demo.badge}</Text>}
          <Text style={s.badge}>{LEVEL_LABELS[explanation.level]}</Text>
        </View>
        <Text style={s.title}>{blueprint.title}</Text>
        <Text style={s.meta}>D'après : {input.sourceTitle} · {date}</Text>

        {input.notes && input.notes.length > 0 && (
          <View style={s.caution}>
            <Text style={s.label}>{fr.reader.partialCoverage}</Text>
            <Bullets items={input.notes} />
          </View>
        )}

        <View style={s.takeaway} wrap={false}>
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
              <Text style={s.h2}>{i + 1}. {sec.question}</Text>
              {sec.blocks[0] && <BlockPdf block={sec.blocks[0]} numbers={numbers} />}
            </View>
            {sec.blocks.slice(1).map((b) => <BlockPdf key={b.id} block={b} numbers={numbers} />)}
            {bs.visual_ids.map((vid) => {
              const v = visuals.get(vid);
              const parsed = v?.kind === "flow" ? FlowData.safeParse(v.data) : null;
              if (!v || !parsed?.success) return null;
              return (
                <View key={v.id} wrap={false}>
                  <FlowPdf data={parsed.data} />
                  <Text style={s.caption}>{v.caption}<Refs ids={v.evidence_ids} numbers={numbers} /></Text>
                  <Text style={[s.caption, s.italic]}>{fr.reader.textAlternative} : {v.alt_text}</Text>
                </View>
              );
            })}
          </View>
        ))}

        {explanation.glossary.length > 0 && (
          <View>
            <Text style={s.h2} minPresenceAhead={110}>{fr.reader.glossary}</Text>
            {explanation.glossary.map((g) => (
              <Text key={g.term} style={s.p}><Text style={{ fontWeight: 700 }}>{g.term}</Text> — {g.definition}</Text>
            ))}
          </View>
        )}

        {explanation.checks.length > 0 && (
          <View>
            <Text style={s.h2} minPresenceAhead={110}>{fr.reader.check}</Text>
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
            <Text style={s.h2} minPresenceAhead={110}>{fr.reader.limits}</Text>
            <Bullets items={explanation.limitations} />
          </View>
        )}

        <View>
          <Text style={s.h2} minPresenceAhead={110}>{fr.reader.sources}</Text>
          <Text style={[s.p, s.muted]}>
            {input.sourceTitle}
            {input.sourceUrl ? <Text> — <Link src={input.sourceUrl}>{input.sourceUrl}</Link></Text> : null}
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
  return renderToBuffer(<ReportDocument {...input} />);
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
