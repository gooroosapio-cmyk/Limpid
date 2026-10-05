"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";

/**
 * Exemple ou analogie avec ses variantes préchargées (V4, § 11) : « Autre exemple » change
 * l'exemple sur place, sans requête IA. Toutes les variantes sont superposées pour réserver
 * la hauteur de la plus longue : changer d'exemple ne décale ni ne coupe la page.
 */
export function ExampleBlock({ label, variants }: { label: string; variants: React.ReactNode[] }) {
  const t = useT();
  const [i, setI] = useState(0);
  const n = variants.length;
  return (
    <div className="example-block">
      <div className="example-head">
        <span className="block-label">{label}</span>
        {n > 1 && (
          <button type="button" className="example-next" onClick={() => setI((x) => (x + 1) % n)} aria-label={`${t.lim.otherExample} (${t.lim.exampleOf(((i + 1) % n) + 1, n)})`}>
            <Icon name="refresh" size={16} /> {t.lim.otherExample}
          </button>
        )}
      </div>
      <div className="example-stack" aria-live="polite">
        {variants.map((v, k) => (
          <div key={k} className={k === i ? "example-variant is-shown" : "example-variant"} aria-hidden={k !== i} inert={k !== i}>
            {v}
          </div>
        ))}
      </div>
      {n > 1 && <p className="example-count muted small" aria-hidden="true">{t.lim.exampleOf(i + 1, n)}</p>}
    </div>
  );
}
