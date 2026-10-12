/** Adapt this exchange contract to the app. Full payload definitions: course.schema.json. */
export type BlockKind = "fact" | "definition" | "list" | "formula" | "analogy" | "fictional_example" | "complement" | "inference" | "caution" | "steps" | "timeline" | "comparison" | "proportion" | "chart" | "calculation" | "details" | "scene" | "important" | "diagram" | "quote" | "code";
export interface ReaderSession { chapterId: string; collapsedSectionIds: string[]; panelReturnScrollY: number; }
export interface ProgressEvent { id: string; courseId: string; contentVersion: string; objectiveId?: string; sectionId?: string; type: "consulted" | "practice_success" | "review_due"; timestamp: string; aided?: boolean; questionId?: string; previousAttemptId?: string; }
export interface ReaderRules { reader: { default: "continuous_chapter"; sections_open_on_chapter_entry: true; resume: "chapter_start"; questions_in_course: "chapter_end_only"; preserve_attempts_on_resume: true }; }
export interface SemanticBlock { id: string; kind: BlockKind; payload: Record<string, unknown>; claim_ids: string[]; evidence_ids: string[]; }
export interface CourseSection { id: string; title: string; objective: string; blocks: SemanticBlock[]; }
export interface Chapter { id: string; title: string; objective: string; essential: string[]; sections: CourseSection[]; retain: string[]; quiz: ChapterQuestion[]; }
export interface QuestionBase { id: string; objective_id: string; prompt: string; revisit_section_id: string; variant_of: string | null; claim_ids: string[]; evidence_ids: string[]; example: boolean; }
export type ChapterQuestion = QuestionBase & (
 { type: "single"; choices: string[]; correct_index: number; explanations: string[] } |
 { type: "multiple"; choices: string[]; correct_indices: number[]; explanations: string[] } |
 { type: "truefalse"; truth: boolean; explanation: string } |
 { type: "order"; items: string[]; explanation: string } |
 { type: "match"; pairs: {left:string;right:string}[]; explanation: string } |
 { type: "cloze"; accepted_answers: string[][]; explanation: string } |
 { type: "short"; expected: string; rubric: string[]; explanation: string }
);
