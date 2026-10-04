import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { pdfHeaders, renderReportPdf } from "@/lib/render/pdf";
import { loadReport } from "@/lib/reports/load";

export const maxDuration = 60;

/** Téléchargement du rapport en PDF (rendu à la demande, aucun appel IA). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const { id } = await ctx.params;
  const v = req.nextUrl.searchParams.get("version");
  const report = await loadReport(id, v && /^\d{1,2}$/.test(v) ? Number(v) : undefined);
  if (!report) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  if (report.state !== "ready") return NextResponse.json({ error: "pas_pret" }, { status: 409 });

  const pdf = await renderReportPdf({
    blueprint: report.blueprint,
    explanation: report.explanation,
    evidence: report.evidence,
    segments: report.segments,
    sourceTitle: report.sourceTitle,
    sourceUrl: report.sourceUrl,
    notes: report.notes,
    partial: report.partial,
    generatedAt: report.createdAt,
  });
  return new NextResponse(new Uint8Array(pdf), { headers: pdfHeaders(report.blueprint.title) });
}
