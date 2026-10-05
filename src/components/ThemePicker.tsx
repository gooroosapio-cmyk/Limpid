"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { THEMES, type ThemeId } from "@/lib/contracts/schemas";
import { useT } from "@/lib/i18n/client";

type Choice = ThemeId | "auto";

const SWATCH: Record<Choice, string> = { auto: "A", sciences: "Aa", recit: "Aa", dossier: "12", guide: "1·2", confort: "Aa" };

/**
 * Choix de la présentation (kit V3, écran « Apparence ») : cinq thèmes éditoriaux ou Automatique.
 * `target` : le rapport affiché (enregistré tout de suite) ou la préférence par défaut.
 */
export function ThemePicker({
  initial,
  target,
  onSave,
  legend,
}: {
  /** null = automatique. */
  initial: ThemeId | null;
  target: { reportId: string } | { preference: true };
  onSave?: (theme: ThemeId | null) => Promise<{ ok: boolean }>;
  legend?: string;
}) {
  const L = useT();
  const start: Choice = initial ?? "auto";
  const [choice, setChoice] = useState<Choice>(start);
  const [saved, setSaved] = useState<Choice>(start);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const router = useRouter();
  const base = useId();
  const isReport = "reportId" in target;

  async function save(next: Choice) {
    setState("saving");
    const value = next === "auto" ? null : next;
    let ok = false;
    try {
      if (isReport) {
        const res = await fetch(`/api/reports/${target.reportId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme_id: value }),
        });
        ok = res.ok;
      } else if (onSave) {
        ok = (await onSave(value)).ok;
      }
    } catch {
      ok = false;
    }
    if (ok) {
      setSaved(next);
      setState("saved");
      router.refresh();
    } else {
      setChoice(saved);
      setState("error");
    }
  }

  const options: Choice[] = ["auto", ...THEMES];
  return (
    <section className="theme-picker" aria-labelledby={`${base}-h`}>
      <fieldset aria-describedby={`${base}-note`}>
        <legend id={`${base}-h`}>{legend ?? L.themes.label}</legend>
        {options.map((t) => (
          <label key={t} className="theme-option">
            <span className={`theme-swatch swatch-${t === "auto" ? "sciences" : t}`} aria-hidden="true">{SWATCH[t]}</span>
            <span>
              <strong>{t === "auto" ? L.themes.auto : L.themes.names[t]}</strong>
              <span className="desc">{t === "auto" ? L.themes.autoDesc : L.themes.descriptions[t]}</span>
            </span>
            <input
              type="radio"
              name={`${base}-theme`}
              value={t}
              checked={choice === t}
              disabled={state === "saving"}
              onChange={() => {
                setChoice(t);
                // Dans le lecteur, le changement est immédiat ; en préférence, on confirme.
                if (isReport) void save(t);
              }}
            />
          </label>
        ))}
      </fieldset>
      <p id={`${base}-note`} className="muted small">{L.themes.note}</p>
      {!isReport && (
        <button type="button" className="btn btn-primary btn-block" disabled={state === "saving" || choice === saved} onClick={() => save(choice)}>
          {L.themes.apply}
        </button>
      )}
      <p role="status" aria-live="polite" className="small">
        {state === "saved" && !isReport ? L.themes.saved : state === "error" ? L.themes.failed : ""}
      </p>
    </section>
  );
}
