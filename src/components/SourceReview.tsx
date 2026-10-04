"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GOALS, LEVELS, TEMPLATES, THEMES, type Goal, type Level, type ThemeId, type VisualMode } from "@/lib/contracts/schemas";
import { fr } from "@/lib/i18n/fr";
import { GOAL_LABELS, LEVEL_DESCRIPTIONS, LEVEL_LABELS, TEMPLATE_LABELS } from "@/lib/labels";

export interface PreviewGroup {
  label: string;
  heading: string | null;
  text: string;
}

interface SourceView {
  id: string;
  title: string;
  kind: string;
  pageCount: number | null;
  pagesRead: number | null;
  paragraphs: number;
  notes: string[];
  partial: boolean;
  pendingOcr: boolean;
  url: string | null;
}

const KIND_LABELS: Record<string, string> = {
  pdf: "PDF",
  docx: "DOCX",
  txt: "TXT",
  paste: "Texte",
  url: "Lien",
  png: "Image",
  jpeg: "Image",
  webp: "Image",
};

/**
 * Maquettes « Vérifier la source » puis « Votre rapport » : le lecteur voit ce qui a
 * réellement été lu (pages, aperçu, passages illisibles) avant de lancer la génération.
 */
export function SourceReview({
  source,
  groups,
  defaultLevel,
  defaultGoal,
  defaultTheme,
  visualModes,
}: {
  source: SourceView;
  groups: PreviewGroup[];
  defaultLevel: Level;
  defaultGoal: Goal;
  defaultTheme: ThemeId;
  /** Modes d'illustration réellement disponibles (connecteurs configurés). */
  visualModes: VisualMode[];
}) {
  const [step, setStep] = useState<"verify" | "settings">("verify");
  const [index, setIndex] = useState(0);
  const [level, setLevel] = useState<Level>(defaultLevel);
  const [pages, setPages] = useState<5 | 7 | 12>(5);
  const [goal, setGoal] = useState<Goal>(defaultGoal);
  const [template, setTemplate] = useState<string>("");
  const [theme, setTheme] = useState<ThemeId>(defaultTheme);
  const [visualMode, setVisualMode] = useState<VisualMode>("auto");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(crypto.randomUUID());
  const router = useRouter();
  const base = useId();
  const group = groups[index];

  async function create() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_id: source.id,
          level,
          goal,
          target_pages: pages,
          template: template || null,
          theme,
          visual_mode: visualMode,
          idempotency_key: key.current,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.reportId) {
        router.push(`/rapports/${data.reportId}`);
        return;
      }
      throw new Error(typeof data.message === "string" ? data.message : fr.source.createFailed);
    } catch (e) {
      setError((e as Error).message || fr.source.createFailed);
      setPending(false);
    }
  }

  if (step === "verify") {
    const read =
      source.pendingOcr
        ? fr.source.pendingOcr
        : source.pagesRead !== null && source.pageCount
          ? fr.source.pagesRead(source.pagesRead, source.pageCount)
          : fr.source.paragraphs(source.paragraphs);
    return (
      <>
        <h1>{fr.source.title}</h1>
        <div className="card source-card">
          <span className="badge">{KIND_LABELS[source.kind] ?? source.kind}</span>
          <div className="source-card-text">
            <p className="source-card-title">{source.title}</p>
            <p className="muted">{read}</p>
          </div>
          {!source.partial && !source.pendingOcr && <span className="source-ok" role="img" aria-label={fr.source.complete}>✓</span>}
        </div>

        {groups.length > 0 && (
          <section aria-labelledby={`${base}-preview`} className="preview">
            <div className="preview-head">
              <h2 id={`${base}-preview`}>{fr.source.preview}</h2>
              {groups.length > 1 && (
                <div className="preview-nav">
                  <button type="button" className="btn-icon" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} aria-label={fr.source.prev}>‹</button>
                  <span aria-live="polite">{index + 1} / {groups.length}</span>
                  <button type="button" className="btn-icon" onClick={() => setIndex((i) => Math.min(groups.length - 1, i + 1))} disabled={index === groups.length - 1} aria-label={fr.source.next}>›</button>
                </div>
              )}
            </div>
            {group && (
              <div className="card preview-body">
                <p className="eyebrow">{group.label}{group.heading ? ` · ${group.heading}` : ""}</p>
                {group.text.split("\n\n").map((t, i) => <p key={i}>{t}</p>)}
              </div>
            )}
          </section>
        )}

        {source.notes.length > 0 && (
          <div className="notice notice-warn" role="status">
            <p><strong>{source.partial ? fr.reader.partialCoverage : fr.reader.aboutSource}</strong></p>
            <ul>{source.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        )}

        <button type="button" className="btn btn-primary btn-block" onClick={() => setStep("settings")}>{fr.source.continue} →</button>
        <p className="center"><Link href="/">{fr.source.change}</Link></p>
      </>
    );
  }

  return (
    <>
      <h1>{fr.source.settingsTitle}</h1>
      <p className="muted">{source.title}</p>
      <div className="card settings">
        <label htmlFor={`${base}-level`}>{fr.create.levelLabel}</label>
        <select id={`${base}-level`} value={level} onChange={(e) => setLevel(e.target.value as Level)} aria-describedby={`${base}-level-desc`}>
          {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
        </select>
        <p id={`${base}-level-desc`} className="muted small">{LEVEL_DESCRIPTIONS[level]}</p>

        <fieldset className="segmented">
          <legend>{fr.create.lengthLabel}</legend>
          {([5, 7, 12] as const).map((n) => (
            <label key={n} className={pages === n ? "segment segment-on" : "segment"}>
              <input type="radio" name="pages" value={n} checked={pages === n} onChange={() => setPages(n)} />
              {fr.source.pages(n)}
            </label>
          ))}
        </fieldset>

        <label htmlFor={`${base}-theme`}>{fr.themes.label}</label>
        <select id={`${base}-theme`} value={theme} onChange={(e) => setTheme(e.target.value as ThemeId)} aria-describedby={`${base}-theme-desc`}>
          {THEMES.map((t) => <option key={t} value={t}>{fr.themes.names[t]}</option>)}
        </select>
        <p id={`${base}-theme-desc`} className="muted small">{fr.themes.descriptions[theme]}</p>

        <details className="options">
          <summary>{fr.source.options}</summary>
          <label htmlFor={`${base}-goal`}>{fr.source.goal}</label>
          <select id={`${base}-goal`} value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
            {GOALS.map((g) => <option key={g} value={g}>{GOAL_LABELS[g]}</option>)}
          </select>
          <label htmlFor={`${base}-template`}>{fr.source.template}</label>
          <select id={`${base}-template`} value={template} onChange={(e) => setTemplate(e.target.value)}>
            <option value="">{fr.source.templateAuto}</option>
            {TEMPLATES.map((t) => <option key={t} value={t}>{TEMPLATE_LABELS[t]}</option>)}
          </select>
          <label htmlFor={`${base}-visuals`}>{fr.visuals.modeLabel}</label>
          <select id={`${base}-visuals`} value={visualMode} onChange={(e) => setVisualMode(e.target.value as VisualMode)} aria-describedby={`${base}-visuals-desc`}>
            {visualModes.map((m) => <option key={m} value={m}>{fr.visuals.modes[m]}</option>)}
          </select>
          <p id={`${base}-visuals-desc`} className="muted small">{fr.visuals.modeHint}</p>
        </details>
      </div>

      {source.pendingOcr && <p className="notice" role="status">{fr.source.ocrNote}</p>}
      <p className="muted small">{fr.source.costNote}</p>
      {error && <p className="notice notice-warn" role="alert">{error}</p>}
      <button type="button" className="btn btn-primary btn-block" onClick={create} disabled={pending}>
        {pending ? fr.create.submitting : `${fr.source.create} →`}
      </button>
      <p className="center">
        <button type="button" className="btn-link" onClick={() => setStep("verify")} disabled={pending}>← {fr.source.back}</button>
      </p>
    </>
  );
}
