import { getEntitlements } from "@/lib/billing/wallet";
import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { pdfHeaders, renderReportPdf, type PdfImage } from "@/lib/render/pdf";
import { creditText } from "@/lib/visuals/credit";
import { loadReport } from "@/lib/reports/load";
import { adminClient } from "@/lib/supabase/admin";
import { dictFor } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";

export const maxDuration = 60;

/**
 * Téléchargement du Limpid en PDF (rendu à la demande, aucun appel IA). ?exercices=1 ajoute
 * les exercices sans réponses ; ?corrige=1 produit le corrigé seul. Le filigrane des exports
 * gratuits est décidé ici, d'après l'offre enregistrée du compte (jamais par le client).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const { id } = await ctx.params;
  const v = req.nextUrl.searchParams.get("version");
  const report = await loadReport(id, v && /^\d{1,2}$/.test(v) ? Number(v) : undefined);
  if (!report) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  if (report.state !== "ready") return NextResponse.json({ error: "pas_pret" }, { status: 409 });

  // Illustrations stockées seulement (une image hébergée par un tiers n'est pas embarquée).
  const images: Record<string, PdfImage> = {};
  const sp = req.nextUrl.searchParams;
  const variant = sp.get("corrige") === "1" ? "key" : sp.get("exercices") === "1" ? "exercises" : "content";
  const [{ data: profile }, lang, ent] = await Promise.all([
    adminClient().from("profiles").select("plan").eq("id", user.id).maybeSingle(),
    getLang(),
    getEntitlements(user.id),
  ]);
  if (variant !== "key") {
    await Promise.all(
      Object.values(report.assets).map(async (a) => {
        if (!a.storagePath || (a.mime !== "image/jpeg" && a.mime !== "image/png")) return;
        const { data } = await adminClient().storage.from("exports").download(a.storagePath);
        if (!data) return;
        images[a.id] = {
          data: Buffer.from(await data.arrayBuffer()),
          format: a.mime === "image/png" ? "png" : "jpg",
          width: a.width,
          height: a.height,
          credit: creditText(a),
        };
      }),
    );
  }
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
    images,
    lang,
    variant,
    exercises: report.exercises,
    // Filigrane décidé côté serveur par l'offre active (« premium » : ancien accès manuel).
    watermark: ent.watermark && profile?.plan !== "premium",
    documents: report.documentTitles,
  });
  const suffix = variant === "key" ? ` (${dictFor(lang).pdf.answerKey})` : "";
  return new NextResponse(new Uint8Array(pdf), { headers: pdfHeaders(`${report.blueprint.title}${suffix}`) });
}
