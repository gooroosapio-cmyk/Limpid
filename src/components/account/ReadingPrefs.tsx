"use client";

import { useState, useTransition } from "react";
import { savePreferenceField } from "@/app/preferences/actions";
import { useT } from "@/lib/i18n/client";

type Field = "familiarity" | "goal" | "default_mode" | "explanation_lang";

/** Préférences pédagogiques directes : chaque choix est enregistré et vaut pour les prochains rapports. */
export function ReadingPrefs({
  familiarity,
  goal,
  concrete,
  defaultMode,
  explanationLang,
}: {
  familiarity: string | null;
  goal: string | null;
  concrete: boolean;
  defaultMode: string | null;
  explanationLang: string | null;
}) {
  const t = useT();
  const [values, setValues] = useState<Record<Field, string | null>>({
    familiarity,
    goal,
    default_mode: defaultMode ?? "claire",
    explanation_lang: explanationLang ?? "fr",
  });
  const [isConcrete, setConcrete] = useState(concrete);
  const [status, setStatus] = useState<"" | "saved" | "failed">("");
  const [pending, start] = useTransition();

  function save(patch: Record<string, string | null>, undo: () => void) {
    start(async () => {
      const res = await savePreferenceField(patch).catch(() => ({ ok: false }));
      setStatus(res.ok ? "saved" : "failed");
      if (!res.ok) undo();
    });
  }

  const group = (field: Field, legend: string, options: Record<string, string>) => (
    <fieldset className="choices" disabled={pending}>
      <legend>{legend}</legend>
      {Object.entries(options).map(([value, label]) => (
        <label key={value} className="choice">
          <input
            type="radio"
            name={field}
            value={value}
            checked={values[field] === value}
            onChange={() => {
              const before = values[field];
              setValues((v) => ({ ...v, [field]: value }));
              save({ [field]: value }, () => setValues((v) => ({ ...v, [field]: before })));
            }}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );

  return (
    <>
      {group("explanation_lang", t.compte.language, t.compte.languages)}
      {group("default_mode", t.compte.defaultMode, Object.fromEntries(Object.entries(t.add.modes).map(([k, v]) => [k, v.title])))}
      {group("familiarity", t.compte.familiarity, t.compte.familiarities)}
      {group("goal", t.compte.goal, t.compte.goals)}
      <label className="setting">
        <span><b>{t.compte.concrete[0]}</b><small>{t.compte.concrete[1]}</small></span>
        <span className="switch">
          <input
            type="checkbox"
            checked={isConcrete}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.checked;
              setConcrete(next);
              save({ example_domain: next ? "quotidien" : "sans_preference" }, () => setConcrete(!next));
            }}
          />
          <i aria-hidden="true" />
        </span>
      </label>
      <p role="status" aria-live="polite" className="small muted">
        {status === "saved" ? t.compte.saved : status === "failed" ? t.compte.failed : ""}
      </p>
    </>
  );
}
