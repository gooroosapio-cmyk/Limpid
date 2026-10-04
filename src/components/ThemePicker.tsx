"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { THEMES, type ThemeId } from "@/lib/contracts/schemas";
import { fr } from "@/lib/i18n/fr";

/**
 * Choix de la présentation (maquette « Présentation ») : Éditorial, Essentiel, Visuel.
 * `target` : le rapport affiché (enregistré tout de suite) ou la préférence par défaut.
 */
export function ThemePicker({
  initial,
  target,
  onSave,
}: {
  initial: ThemeId;
  target: { reportId: string } | { preference: true };
  /** Enregistrement de la préférence (action serveur). */
  onSave?: (theme: ThemeId) => Promise<{ ok: boolean }>;
}) {
  const [theme, setTheme] = useState<ThemeId>(initial);
  const [saved, setSaved] = useState<ThemeId>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const router = useRouter();
  const base = useId();
  const isReport = "reportId" in target;

  async function save(next: ThemeId) {
    setState("saving");
    let ok = false;
    try {
      if (isReport) {
        const res = await fetch(`/api/reports/${target.reportId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme_id: next }),
        });
        ok = res.ok;
      } else if (onSave) {
        ok = (await onSave(next)).ok;
      }
    } catch {
      ok = false;
    }
    if (ok) {
      setSaved(next);
      setState("saved");
      router.refresh();
    } else {
      setTheme(saved);
      setState("error");
    }
  }

  return (
    <section className="theme-picker" aria-labelledby={`${base}-h`}>
      <fieldset aria-describedby={`${base}-note`}>
        <legend id={`${base}-h`}>{isReport ? fr.themes.label : fr.themes.title}</legend>
        {!isReport && <p className="muted">{fr.themes.intro}</p>}
        {THEMES.map((t) => (
          <label key={t} className="theme-option">
            <input
              type="radio"
              name={`${base}-theme`}
              value={t}
              checked={theme === t}
              disabled={state === "saving"}
              onChange={() => {
                setTheme(t);
                // Dans le lecteur, le changement est immédiat ; en préférence, on confirme.
                if (isReport) void save(t);
              }}
            />
            <span>
              <strong>{fr.themes.names[t]}</strong>
              <span>{fr.themes.descriptions[t]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p id={`${base}-note`} className="muted small">{fr.themes.note}</p>
      {!isReport && (
        <button type="button" className="btn btn-primary btn-block" disabled={state === "saving" || theme === saved} onClick={() => save(theme)}>
          {fr.themes.apply}
        </button>
      )}
      <p role="status" aria-live="polite" className="small">
        {state === "saved" && !isReport ? fr.themes.saved : state === "error" ? fr.themes.failed : ""}
      </p>
    </section>
  );
}
