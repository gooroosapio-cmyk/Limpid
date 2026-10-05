import type { Metadata } from "next";
import { Immersive } from "@/components/reader/Immersive";
import { Reader } from "@/components/reader/Reader";
import { ReportOptions } from "@/components/reader/ReportOptions";
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
    <Immersive>
      <div className="page page-reader">
        <Reader
          blueprint={demoBlueprint}
          explanation={demoExplanation}
          evidence={demoEvidence}
          segments={demoSegments}
          sourceTitle={DEMO_SOURCE_TITLE}
          actionsNote={fr.reader.demoActions}
          isDemo
          options={
            <ReportOptions
              reportId={null}
              pdfHref="/rapports/demo/pdf"
              originalHref={null}
              sourceTitle={DEMO_SOURCE_TITLE}
              themeLabel={fr.themes.names.sciences ?? "Sciences"}
            />
          }
        />
      </div>
    </Immersive>
  );
}
