import type { SourceEntry } from "@/lib/render/sources";
import { Immersive } from "../Immersive";
import { NotionsProvider, type Notion } from "../Notions";
import { SourcesProvider } from "../Sources";
import type { Exercise } from "@/lib/contracts/schemas";
import { LimpidReader } from "./LimpidReader";
import type { OptionsData } from "./OptionsPanel";

/** Écran de lecture : panneaux des sources et des notions autour du lecteur paginé. */
export function LimpidScreen({
  doc,
  reportId,
  versionId,
  initialAnchor,
  bilan,
  insufficient,
  options,
}: {
  doc: { chapters: { id: string; title: string }[]; notions: Notion[]; entries: SourceEntry[]; pieces: React.ReactNode };
  reportId: string | null;
  versionId: string | null;
  initialAnchor: string | null;
  bilan: Exercise[] | null;
  insufficient: boolean;
  options: OptionsData;
}) {
  return (
    <Immersive>
      <SourcesProvider entries={doc.entries} sourceTitle={options.sourceTitle} originalHref={options.originalHref}>
        <NotionsProvider notions={doc.notions} checkHref={null}>
          <LimpidReader
            reportId={reportId}
            versionId={versionId}
            chapters={doc.chapters}
            initialAnchor={initialAnchor}
            bilan={bilan}
            insufficient={insufficient}
            options={options}
          >
            <article className="lim" aria-label={options.title}>{doc.pieces}</article>
          </LimpidReader>
        </NotionsProvider>
      </SourcesProvider>
    </Immersive>
  );
}
