import type { SourceEntry } from "@/lib/render/sources";
import { AnnexProvider } from "../annex-link";
import { Immersive } from "../Immersive";
import { NotionsProvider, type Notion } from "../Notions";
import { SourcesProvider } from "../Sources";
import type { ChapterQuestion, Exercise, Section } from "@/lib/contracts/schemas";
import { LimpidReader } from "./LimpidReader";
import type { OptionsData } from "./OptionsPanel";

/** QCM de fin de chapitre (V6) par chapitre : seuls les chapitres qui en ont un. */
export function chapterQuizzes(sections: Pick<Section, "id" | "quiz">[]): Record<string, ChapterQuestion[]> {
  return Object.fromEntries(sections.flatMap((s) => (s.quiz?.length ? [[s.id, s.quiz]] : [])));
}

/** Écran de lecture : notions et accès aux annexes (page à part) autour du lecteur paginé. */
export function LimpidScreen({
  doc,
  reportId,
  versionId,
  initialAnchor,
  bilan,
  insufficient,
  options,
  annexBase,
  originalHref,
  quizzes,
}: {
  doc: { chapters: { id: string; title: string }[]; notions: Notion[]; entries: SourceEntry[]; pieces: React.ReactNode };
  reportId: string | null;
  versionId: string | null;
  initialAnchor: string | null;
  bilan: Exercise[] | null;
  insufficient: boolean;
  options: OptionsData;
  /** Page Annexes du même rapport et de la même version. */
  annexBase: string;
  originalHref: string | null;
  /** QCM de fin de chapitre (V6), cf. `chapterQuizzes`. */
  quizzes?: Record<string, ChapterQuestion[]>;
}) {
  return (
    <Immersive>
      <AnnexProvider base={annexBase} progressId={reportId ?? "demo"}>
      <SourcesProvider entries={doc.entries} sourceTitle={options.sourceTitle} originalHref={originalHref}>
        <NotionsProvider notions={doc.notions} checkHref={null}>
          <LimpidReader
            reportId={reportId}
            versionId={versionId}
            chapters={doc.chapters}
            initialAnchor={initialAnchor}
            bilan={bilan}
            insufficient={insufficient}
            options={options}
            quizzes={quizzes}
          >
            <article className="lim" aria-label={options.title}>{doc.pieces}</article>
          </LimpidReader>
        </NotionsProvider>
      </SourcesProvider>
      </AnnexProvider>
    </Immersive>
  );
}
