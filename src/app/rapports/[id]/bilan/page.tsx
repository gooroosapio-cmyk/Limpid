import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BilanRun } from "@/components/bilan/BilanRun";
import { Immersive } from "@/components/reader/Immersive";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { bilanPage } from "@/lib/reports/bilan";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.lim.bilanTitle };
}

/** Bilan de compréhension en page entière (kit V5) : introduction, questions et résultats. */
export default async function BilanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const data = await bilanPage(user.id, id);
  if (!data) redirect(`/rapports/${id}`);
  return (
    <Immersive>
      <BilanRun reportId={id} versionId={data.versionId} questions={data.questions} chapters={data.chapters} insufficient={data.insufficient} />
    </Immersive>
  );
}
