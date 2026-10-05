import type { Metadata } from "next";
import { AnnexesView } from "@/components/reader/AnnexesView";
import { Screen } from "@/components/shell/Screen";
import { getT } from "@/lib/i18n/server";
import { DEMO_SOURCE_TITLE, demoBlueprint, demoEvidence, demoExplanation, demoSegments } from "@/lib/demo/cycle-eau";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: `${t.lim.annexTitle} (${t.demo.badge})` };
}

const ANCHOR_RE = /^[A-Za-z0-9_-]{1,80}$/;

/** Annexes du Limpid de démonstration (données locales, aucun appel). */
export default async function DemoAnnexesPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const t = await getT();
  const { from } = await searchParams;
  const sourceId = demoSegments[0]?.source_id.replace(/^src_/, "") ?? "demo";
  return (
    <Screen footer={false} className="annex-screen">
      <AnnexesView
        t={t}
        title={demoBlueprint.title}
        backHref={`/rapports/demo${from && ANCHOR_RE.test(from) ? `?a=${from}` : ""}`}
        blueprint={demoBlueprint}
        explanation={demoExplanation}
        evidence={demoEvidence}
        segments={demoSegments}
        documents={[{ sourceId, title: DEMO_SOURCE_TITLE, originalHref: null }]}
      />
    </Screen>
  );
}
