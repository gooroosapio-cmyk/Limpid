import type { Metadata } from "next";
import { Reader } from "@/components/reader/Reader";
import { ReportOptions } from "@/components/reader/ReportOptions";
import { Screen } from "@/components/shell/Screen";
import { fr } from "@/lib/i18n/fr";
import {
  DEMO_SOURCE_TITLE,
  demoBlueprint,
  demoEvidence,
  demoExplanation,
  demoSegments,
} from "@/lib/demo/cycle-eau";

export const metadata: Metadata = { title: `${demoBlueprint.title} (démonstration)` };

export default function DemoReportPage() {
  return (
    <Screen
      title={fr.reader.title}
      back="/"
      actions={
        <ReportOptions
          reportId={null}
          pdfHref="/rapports/demo/pdf"
          originalHref={null}
          sourceTitle={DEMO_SOURCE_TITLE}
          themeLabel={fr.themes.names.sciences ?? "Sciences"}
        />
      }
    >
      <Reader
        blueprint={demoBlueprint}
        explanation={demoExplanation}
        evidence={demoEvidence}
        segments={demoSegments}
        sourceTitle={DEMO_SOURCE_TITLE}
        actionsNote={fr.reader.demoActions}
        isDemo
      />
    </Screen>
  );
}
