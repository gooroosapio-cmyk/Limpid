import type { Metadata } from "next";
import { Immersive } from "@/components/reader/Immersive";
import { Reader } from "@/components/reader/Reader";
import { ReportOptions } from "@/components/reader/ReportOptions";
import { getT } from "@/lib/i18n/server";
import {
  DEMO_SOURCE_TITLE,
  demoBlueprint,
  demoEvidence,
  demoExplanation,
  demoSegments,
} from "@/lib/demo/cycle-eau";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: `${demoBlueprint.title} (démonstration)` };
}

export default async function DemoReportPage() {
  const t = await getT();
  return (
    <Immersive>
      <div className="page page-reader">
        <Reader
        t={t}
          blueprint={demoBlueprint}
          explanation={demoExplanation}
          evidence={demoEvidence}
          segments={demoSegments}
          sourceTitle={DEMO_SOURCE_TITLE}
          actionsNote={t.reader.demoActions}
          isDemo
          options={
            <ReportOptions
              reportId={null}
              pdfHref="/rapports/demo/pdf"
              originalHref={null}
              sourceTitle={DEMO_SOURCE_TITLE}
              themeLabel={t.themes.names.sciences ?? "Sciences"}
            />
          }
        />
      </div>
    </Immersive>
  );
}
