import type { Metadata } from "next";
import { Reader } from "@/components/reader/Reader";
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
    <Reader
      blueprint={demoBlueprint}
      explanation={demoExplanation}
      evidence={demoEvidence}
      segments={demoSegments}
      sourceTitle={DEMO_SOURCE_TITLE}
      pdfHref="/rapports/demo/pdf"
      actionsNote={fr.reader.demoActions}
      isDemo
    />
  );
}
