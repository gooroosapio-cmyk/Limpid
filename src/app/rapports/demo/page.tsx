import type { Metadata } from "next";
import { cookies } from "next/headers";
import { composeLimpid } from "@/components/reader/v4/Pieces";
import { chapterQuizzes, LimpidScreen } from "@/components/reader/v4/LimpidScreen";
import { readDisplayPrefs } from "@/lib/display/prefs";
import { getT } from "@/lib/i18n/server";
import { readerV3Enabled } from "@/lib/reader/flags";
import { DEMO_SOURCE_TITLE, demoBlueprint, demoEvidence, demoExplanation, demoSegments } from "@/lib/demo/cycle-eau";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: `${demoBlueprint.title} (${t.demo.badge})` };
}

export default async function DemoReportPage() {
  const [t, jar] = await Promise.all([getT(), cookies()]);
  const doc = composeLimpid({
    t,
    blueprint: demoBlueprint,
    explanation: demoExplanation,
    evidence: demoEvidence,
    segments: demoSegments,
    exercises: null,
    modeLabel: t.add.modes.claire?.title ?? null,
    status: <p className="notice" role="note">{t.reader.demoActions}</p>,
    canReformulate: false,
    isDemo: true,
  });
  return (
    <LimpidScreen
      doc={doc}
      readerV3={await readerV3Enabled()}
      quizzes={chapterQuizzes(demoExplanation.sections)}
      reportId={null}
      versionId={null}
      initialAnchor={null}
      bilan={null}
      insufficient={false}
      annexBase="/rapports/demo/annexes"
      originalHref={null}
      options={{
        reportId: null,
        title: demoBlueprint.title,
        pdfHref: "/rapports/demo/pdf",
        hasExercises: false,
        sourceTitle: DEMO_SOURCE_TITLE,
        mode: "claire",
        versions: [],
        offlineAccount: null,
        display: readDisplayPrefs((n) => jar.get(n)?.value),
      }}
    />
  );
}
