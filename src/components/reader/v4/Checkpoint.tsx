"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import type { Exercise } from "@/lib/contracts/schemas";
import { useT } from "@/lib/i18n/client";
import { useReader } from "./context";
import { ExerciseView, type ExerciseResult } from "./ExerciseView";

/**
 * Point de contrôle (V4, § 10) : lecture → quiz → correction → reprise. Pendant le quiz, le
 * carrousel est suspendu ; « Continuer la lecture » ouvre la vue suivante. On peut passer.
 */
export function Checkpoint({ id, sectionId, exercises }: { id: string; sectionId: string; exercises: Exercise[] }) {
  const t = useT();
  const reader = useReader();
  const [results, setResults] = useState<Record<string, ExerciseResult>>({});
  const [active, setActive] = useState(false);
  const done = exercises.every((e) => results[e.id]);
  const score = Object.values(results).filter((r) => r.correct).length;

  function start() {
    if (!active) {
      setActive(true);
      reader.suspend(true);
    }
  }

  function leave() {
    setActive(false);
    reader.suspend(false);
    reader.continueAfter(id);
  }

  async function record(next: Record<string, ExerciseResult>) {
    if (!reader.reportId || !reader.versionId || !exercises.every((e) => next[e.id])) return;
    const graded = exercises.map((e) => next[e.id]!);
    await fetch(`/api/reports/${reader.reportId}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version_id: reader.versionId,
        kind: "checkpoint",
        section_id: sectionId,
        score: graded.filter((r) => r.correct).length,
        total: graded.length,
        answers: graded,
      }),
    }).catch(() => undefined);
  }

  return (
    <section className="checkpoint" aria-labelledby={`${id}-h`} onFocusCapture={start} onPointerDown={start}>
      <p className="eyebrow checkpoint-eyebrow"><Icon name="quiz" size={16} /> {t.lim.checkpoint}</p>
      <h3 id={`${id}-h`} className="checkpoint-title">{t.lim.checkpointIntro}</h3>
      {exercises.map((ex) => (
        <ExerciseView
          key={ex.id}
          ex={ex}
          reportId={reader.reportId}
          versionId={reader.versionId}
          onGoTo={(sid) => {
            setActive(false);
            reader.suspend(false);
            reader.goTo(sid);
          }}
          onDone={(r) =>
            setResults((prev) => {
              const next = { ...prev, [r.id]: r };
              void record(next);
              return next;
            })
          }
        />
      ))}
      <div className="checkpoint-foot">
        {done && <p className="checkpoint-score" role="status">{t.lim.checkpointScore(score, exercises.length)}</p>}
        <button type="button" className={done ? "btn btn-primary btn-block" : "btn-link"} onClick={leave}>
          {done ? t.lim.continueReading : t.lim.skip} {done && <Icon name="arrow" />}
        </button>
      </div>
    </section>
  );
}
