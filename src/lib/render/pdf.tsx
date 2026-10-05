/**
 * Export PDF d'un Limpid (V4, § 12). Rendu déterministe côté serveur à partir du document
 * structuré : aucun appel IA, aucune ressource externe, police intégrée (Inter, OFL), style
 * unique. Même contenu et même numérotation des sources que le lecteur, annexes comprises.
 * Les exercices (sans réponses) et leur corrigé sont des exports distincts ; le filigrane
 * discret des exports gratuits est décidé par le serveur.
 */
import "server-only";
import path from "node:path";
import { Document, Font, Image, Link, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { Evidence, Exercise, ExerciseSet, ExplanationObject, ReportBlueprint, SourceSegment, VisualSpec } from "@/lib/contracts/schemas";
import { shuffled } from "@/lib/exercises/grade";
import { dictFor, type Dict, type Lang } from "@/lib/i18n";
import { stripRich } from "@/lib/reader/rich";
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
  number: { width: 18 },
  formula: { fontFamily: "Courier", fontSize: 11, padding: 8, borderWidth: 1, borderColor: C.bordure, borderRadius: 6, marginBottom: 6 },
  exercise: { borderWidth: 1, borderColor: C.bordure, borderRadius: 8, padding: 10, marginBottom: 8 },
  lines: { borderBottomWidth: 0.5, borderBottomColor: C.bordure, height: 18 },
  watermark: { position: "absolute", top: 20, left: 52, right: 52, fontSize: 7.5, color: C.gris, textAlign: "right" },
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

/** Style unique du PDF (V4) : sobre, lisible à l'impression. */
const T = {
  page: { backgroundColor: "#FFFFFF" } as Style,
  takeaway: { backgroundColor: C.jauneDoux, borderRadius: 8, padding: 12, marginBottom: 16 } as Style,
  boxed: { borderLeftWidth: 3, borderLeftColor: C.jaune, paddingLeft: 8, marginBottom: 8 } as Style,
  key: { backgroundColor: "#E8EFE8", borderRadius: 6, padding: 8, marginBottom: 8 } as Style,
  caution: { borderLeftWidth: 3, borderLeftColor: C.encre, paddingLeft: 8, marginBottom: 8 } as Style,
  complement: { borderWidth: 1, borderStyle: "dashed", borderColor: C.bordure, borderRadius: 6, padding: 8, marginBottom: 8 } as Style,
  definition: { marginBottom: 8 } as Style,
  bar: C.jaune,
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

function Bullets({ items, ordered = false, start = 1 }: { items: React.ReactNode[]; ordered?: boolean; start?: number }) {
  return (
    <View>
      {items.map((t, i) => (
        <View key={i} style={s.li} wrap={false}>
          <Text style={ordered ? s.number : s.bullet}>{ordered ? `${start + i}.` : "•"}</Text>
          <Text style={s.liText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

/** Texte du modèle sans marques de mise en forme (le gras léger n'est pas reproduit). */
const plain = stripRich;

function BlockPdf({ block, numbers, d }: { block: Block; numbers: Map<string, number>; d: Dict }) {
  const refs = <Refs ids={block.evidence_ids} numbers={numbers} />;
  switch (block.type) {
    case "fact":
      return block.emphasis === "key" ? (
        <View style={T.key} wrap={false}>
          <Text style={s.label}>{d.lim.keyIdea}</Text>
          <Text style={{ fontWeight: 700 }}>{plain(block.text)}{refs}</Text>
        </View>
      ) : (
        <Text style={s.p}>{plain(block.text)}{refs}</Text>
      );
    case "definition":
      return (
        <View style={T.definition}>
          <Text style={s.label}>{d.lim.definition}</Text>
          <Text><Text style={{ fontWeight: 700 }}>{block.term}</Text> — {plain(block.text)}{refs}</Text>
        </View>
      );
    case "analogy":
      return (
        <View style={T.boxed}>
          <Text style={s.label}>{d.lim.analogy}</Text>
          <Text style={s.p}>{plain(block.text)}</Text>
          <Text style={s.muted}><Text style={{ fontWeight: 700 }}>{d.lim.limit}</Text> {block.limit}</Text>
        </View>
      );
    case "fictional_example":
      return (
        <View style={T.boxed}>
          <Text style={s.label}>{d.lim.example}</Text>
          <Text style={s.italic}>{plain(block.text)}</Text>
        </View>
      );
    case "inference":
      return (
        <View style={s.block}>
          <Text style={s.label}>{d.lim.inference}</Text>
          <Text>{plain(block.text)}{refs}</Text>
        </View>
      );
    case "caution":
      return (
        <View style={T.caution}>
          <Text style={s.label}>{d.lim.caution}</Text>
          <Text>{plain(block.text)}{refs}</Text>
        </View>
      );
    case "complement":
      return (
        <View style={T.complement}>
          <Text style={s.label}>{d.lim.complement}</Text>
          <Text>{plain(block.text)}</Text>
        </View>
      );
    case "list":
      return (
        <View style={s.block}>
          <Text style={s.p}>{plain(block.text)}{refs}</Text>
          <Bullets
            ordered={block.style !== "bullets"}
            items={block.items.map((it, i) => (
              <Text key={i}>{plain(it.text)}<Refs ids={it.evidence_ids} numbers={numbers} /></Text>
            ))}
          />
        </View>
      );
    case "formula":
      return (
        <View style={s.block} wrap={false}>
          <Text style={s.formula}>{block.expression}</Text>
          {block.symbols.length > 0 && (
            <View style={{ marginBottom: 4 }}>
              <Text style={s.muted}>{d.lim.symbols}</Text>
              {block.symbols.map((x) => (
                <Text key={x.symbol}><Text style={{ fontWeight: 700 }}>{x.symbol}</Text> : {x.meaning}</Text>
              ))}
            </View>
          )}
          <Text>{plain(block.text)}{refs}</Text>
        </View>
      );
  }
}

function FlowPdf({ data, cycle }: { data: FlowData; cycle: string }) {
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
      {data.cyclic && <Text style={s.caption}>{cycle}</Text>}
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

function ComparisonPdf({ data, notStated }: { data: ComparisonData; notStated: string }) {
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
            <Text key={c} style={[cell, o.cells[i]?.text ? {} : s.muted]}>{o.cells[i]?.text ?? notStated}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function VisualPdf({ v, numbers, d, images }: { v: VisualSpec; numbers: Map<string, number>; d: Dict; images: Record<string, PdfImage> }) {
  const caption = <Text style={s.caption}>{v.caption}<Refs ids={v.evidence_ids} numbers={numbers} /></Text>;
  const alt = <Text style={[s.caption, s.italic]}>{d.reader.textAlternative} : {v.alt_text}</Text>;
  if (v.kind === "flow") {
    const fd = FlowData.safeParse(v.data);
    return fd.success ? <View wrap={false}><FlowPdf data={fd.data} cycle={d.pdf.cycle} />{caption}{alt}</View> : null;
  }
  if (v.kind === "bar_chart") {
    const cd = ChartData.safeParse(v.data);
    return cd.success ? <View wrap={false}><ChartPdf data={cd.data} color={T.bar} />{caption}{alt}</View> : null;
  }
  if (v.kind === "comparison_table") {
    const td = ComparisonData.safeParse(v.data);
    return td.success ? <View><ComparisonPdf data={td.data} notStated={d.visuals.notStated} />{caption}</View> : null;
  }
  if (v.kind === "illustration") {
    const id = IllustrationData.safeParse(v.data);
    const img = id.success && id.data.asset_id ? images[id.data.asset_id] : undefined;
    if (!img) return null;
    const width = 300;
    return (
      <View wrap={false} style={{ alignItems: "center", marginVertical: 8 }}>
        <Image src={{ data: img.data, format: img.format }} style={{ width, height: Math.round((width * img.height) / img.width) }} />
        <Text style={s.caption}>{d.visuals.illustration} : {v.caption}</Text>
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
  /** Illustrations par identifiant d'actif (celles servies par un hébergeur tiers en sont exclues). */
  images?: Record<string, PdfImage>;
  /** Langue de l'interface (titres, mentions) ; le contenu reste dans sa langue. */
  lang?: Lang;
  /** « content » : contenu et annexes ; « exercises » : avec les exercices sans réponses ; « key » : corrigé seul. */
  variant?: "content" | "exercises" | "key";
  exercises?: ExerciseSet | null;
  /** Filigrane discret des exports gratuits (décidé par le serveur selon l'offre du compte). */
  watermark?: boolean;
}

const LETTERS = "ABCDEFGHIJ";

/** Énoncé d'un exercice, sans la réponse (ordre et associations mélangés de façon stable). */
function ExerciseQuestion({ ex, n, d }: { ex: Exercise; n: number; d: Dict }) {
  const prompt = <Text style={[s.p, { fontWeight: 700 }]}>{n}. {plain(ex.prompt)}</Text>;
  return (
    <View style={s.exercise} wrap={false}>
      {prompt}
      {(ex.kind === "single" || ex.kind === "multiple") && (
        <View>
          {ex.kind === "multiple" && <Text style={s.muted}>{d.lim.several}</Text>}
          {ex.options.map((o, i) => <Text key={i}>{LETTERS[i]}. {plain(o.text)}</Text>)}
        </View>
      )}
      {ex.kind === "truefalse" && <Text>{d.lim.trueLabel}  /  {d.lim.falseLabel}</Text>}
      {ex.kind === "order" && (
        <View>
          <Text style={s.muted}>{d.pdf.order}</Text>
          {shuffled(ex.items, ex.id).map((it, i) => <Text key={i}>___  {plain(it)}</Text>)}
        </View>
      )}
      {ex.kind === "match" && (
        <View style={{ flexDirection: "row", gap: 16 }}>
          <View style={{ flex: 1 }}>{ex.pairs.map((p, i) => <Text key={i}>{i + 1}. {plain(p.left)}</Text>)}</View>
          <View style={{ flex: 1 }}>
            {shuffled(ex.pairs.map((p) => p.right), ex.id).map((r, i) => <Text key={i}>{LETTERS[i]}. {plain(r)}</Text>)}
          </View>
        </View>
      )}
      {ex.kind === "short" && (
        <View>
          <Text style={s.muted}>{d.pdf.answerLines}</Text>
          <View style={s.lines} />
          <View style={s.lines} />
          <View style={s.lines} />
        </View>
      )}
    </View>
  );
}

/** Corrigé d'un exercice : réponse et explication. */
function ExerciseKey({ ex, n, d }: { ex: Exercise; n: number; d: Dict }) {
  let answer = "";
  if (ex.kind === "single" || ex.kind === "multiple")
    answer = ex.options.flatMap((o, i) => (o.correct ? [`${LETTERS[i]}. ${plain(o.text)}`] : [])).join(" ; ");
  else if (ex.kind === "truefalse") answer = ex.truth ? d.lim.trueLabel : d.lim.falseLabel;
  else if (ex.kind === "order") answer = ex.items.map(plain).join(" → ");
  else if (ex.kind === "match") answer = ex.pairs.map((p) => `${plain(p.left)} — ${plain(p.right)}`).join(" ; ");
  else if (ex.kind === "cloze") answer = ex.blanks.map((b) => b[0]).join(" · ");
  else if (ex.kind === "short") answer = ex.expected ?? "";
  return (
    <View style={s.exercise} wrap={false}>
      <Text style={[s.p, { fontWeight: 700 }]}>{n}. {plain(ex.prompt)}</Text>
      <Text><Text style={{ fontWeight: 700 }}>{d.pdf.answer}</Text> {answer}</Text>
      {ex.kind === "short" && ex.rubric.length > 0 && (
        <View style={{ marginTop: 4 }}>
          <Text style={s.muted}>{d.pdf.expectedPoints}</Text>
          <Bullets items={ex.rubric} />
        </View>
      )}
      {ex.explanation ? <Text style={[s.muted, { marginTop: 4 }]}>{plain(ex.explanation)}</Text> : null}
    </View>
  );
}

function exerciseGroups(set: ExerciseSet, titles: Map<string, string>, d: Dict): { title: string; items: Exercise[] }[] {
  const groups = set.checkpoints
    .filter((c) => c.exercises.length > 0)
    .map((c) => ({ title: d.pdf.checkpointOf(titles.get(c.section_id) ?? c.section_id), items: c.exercises }));
  if (set.bilan.length) groups.push({ title: d.pdf.bilan, items: set.bilan });
  return groups;
}

function Chrome({ d, watermark }: { d: Dict; watermark: boolean }) {
  return (
    <>
      {watermark && <Text style={s.watermark} fixed>{d.pdf.watermark}</Text>}
      <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => d.pdf.footer(pageNumber, totalPages)} />
    </>
  );
}

function ReportDocument(input: PdfReportInput) {
  const { blueprint, explanation } = input;
  const lang = input.lang ?? "fr";
  const d = dictFor(lang);
  const variant = input.variant ?? "content";
  const watermark = !!input.watermark;
  const { numbers, entries } = sourceEntries(blueprint, input.evidence, input.segments);
  const sections = new Map(explanation.sections.map((x) => [x.id, x]));
  const visuals = new Map(blueprint.visual_specs.map((v) => [v.id, v]));
  const date = (input.generatedAt ?? new Date()).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const ordered = blueprint.sections.flatMap((bs) => {
    const sec = sections.get(bs.section_id);
    return sec ? [{ bs, sec }] : [];
  });
  const titles = new Map(ordered.map(({ sec }) => [sec.id, sec.question]));
  const groups = input.exercises ? exerciseGroups(input.exercises, titles, d) : [];
  const keyPoints = explanation.key_points?.length ? explanation.key_points : explanation.sections.slice(0, 5).map((x) => x.takeaway);
  const modeLabel = explanation.mode ? d.add.modes[explanation.mode]?.title : null;

  if (variant === "key") {
    let n = 0;
    return (
      <Document title={`${d.pdf.answerKey} — ${blueprint.title}`} author="Limpid" creator="Limpid" producer="Limpid" language={lang}>
        <Page size="A4" style={[s.page, T.page]}>
          <Text style={s.brand}>limpid</Text>
          <Text style={s.title}>{d.pdf.answerKey}</Text>
          <Text style={s.meta}>{d.pdf.answerKeyIntro(blueprint.title)}</Text>
          {groups.length === 0 && <Text>{d.pdf.noExercises}</Text>}
          {groups.map((g) => (
            <View key={g.title}>
              <Text style={s.h2} minPresenceAhead={110}>{g.title}</Text>
              {g.items.map((ex) => <ExerciseKey key={ex.id} ex={ex} n={++n} d={d} />)}
            </View>
          ))}
          <Chrome d={d} watermark={watermark} />
        </Page>
      </Document>
    );
  }

  let qn = 0;
  return (
    <Document title={blueprint.title} author="Limpid" creator="Limpid" producer="Limpid" language={lang}>
      <Page size="A4" style={[s.page, T.page]}>
        <Text style={s.brand}>limpid</Text>
        <View style={s.badges}>
          {input.isDemo && <Text style={s.badgeDemo}>{d.demo.badge}</Text>}
          {modeLabel && <Text style={s.badge}>{modeLabel}</Text>}
        </View>
        <Text style={s.title}>{blueprint.title}</Text>
        <Text style={s.meta}>{d.pdf.basedOn(input.sourceTitle, date)}</Text>

        {input.notes && input.notes.length > 0 && (
          <View style={T.caution}>
            <Text style={s.label}>{input.partial === false ? d.reader.aboutSource : d.reader.partialCoverage}</Text>
            <Bullets items={input.notes} />
          </View>
        )}

        <View style={T.takeaway} wrap={false}>
          <Text style={s.boxTitle}>{d.lim.keyPoints}</Text>
          <Bullets items={keyPoints.map(plain)} />
        </View>
        {explanation.short_result && <Text style={[s.p, s.muted]}>{d.lim.shortResult}</Text>}

        <View style={s.toc}>
          <Text style={s.boxTitle}>{d.lim.toc}</Text>
          {ordered.map(({ sec }, i) => <Text key={sec.id}>{i + 1}. {sec.question}</Text>)}
        </View>

        {ordered.map(({ bs, sec }, i) => (
          <View key={sec.id}>
            {/* Le titre reste avec son premier bloc : jamais seul en bas de page. */}
            <View wrap={false}>
              <Text style={s.h2}>{i + 1}. {sec.question}</Text>
              {sec.blocks[0] && <BlockPdf block={sec.blocks[0]} numbers={numbers} d={d} />}
            </View>
            {sec.blocks.slice(1).map((b) => <BlockPdf key={b.id} block={b} numbers={numbers} d={d} />)}
            {bs.visual_ids.map((vid) => {
              const v = visuals.get(vid);
              return v ? <VisualPdf key={v.id} v={v} numbers={numbers} d={d} images={input.images ?? {}} /> : null;
            })}
          </View>
        ))}

        {variant === "exercises" && (
          <View break>
            <Text style={s.h2}>{d.pdf.exercises}</Text>
            <Text style={[s.p, s.muted]}>{groups.length ? d.pdf.exercisesIntro : d.pdf.noExercises}</Text>
            {groups.map((g) => (
              <View key={g.title}>
                <Text style={[s.h2, { fontSize: 12 }]} minPresenceAhead={110}>{g.title}</Text>
                {g.items.map((ex) => <ExerciseQuestion key={ex.id} ex={ex} n={++qn} d={d} />)}
              </View>
            ))}
          </View>
        )}

        <View break>
          <Text style={[s.h2, { fontSize: 16 }]}>{d.lim.annexes}</Text>
          {explanation.limitations.length > 0 && (
            <View>
              <Text style={s.h2} minPresenceAhead={110}>{d.lim.limits}</Text>
              <Bullets items={explanation.limitations} />
            </View>
          )}
          {explanation.glossary.length > 0 && (
            <View>
              <Text style={s.h2} minPresenceAhead={110}>{d.lim.optGlossary}</Text>
              {explanation.glossary.map((g) => (
                <Text key={g.term} style={s.p}><Text style={{ fontWeight: 700 }}>{g.term}</Text> — {g.definition}</Text>
              ))}
            </View>
          )}
          <View>
            <Text style={s.h2} minPresenceAhead={110}>{d.reader.sources}</Text>
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
        </View>

        <Chrome d={d} watermark={watermark} />
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
