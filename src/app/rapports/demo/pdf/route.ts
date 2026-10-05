import { NextResponse } from "next/server";
import { DEMO_SOURCE_TITLE, demoBlueprint, demoEvidence, demoExplanation, demoSegments } from "@/lib/demo/cycle-eau";
import { getLang } from "@/lib/i18n/server";
import { pdfHeaders, renderReportPdf } from "@/lib/render/pdf";

/** PDF du rapport de démonstration (contenu public, rédigé à la main). */
export async function GET() {
  const pdf = await renderReportPdf({
    blueprint: demoBlueprint,
    explanation: demoExplanation,
    evidence: demoEvidence,
    segments: demoSegments,
    sourceTitle: DEMO_SOURCE_TITLE,
    isDemo: true,
    lang: await getLang(),
    watermark: true,
  });
  return new NextResponse(new Uint8Array(pdf), { headers: pdfHeaders(`${demoBlueprint.title} (démonstration)`) });
}
