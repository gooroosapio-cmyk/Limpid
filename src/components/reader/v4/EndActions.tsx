"use client";

import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";
import { useReader } from "./context";

/** Fin du Limpid (V4, § 10-11) : bilan de compréhension et autre formulation. */
export function EndActions({ canReformulate }: { canReformulate: boolean }) {
  const t = useT();
  const reader = useReader();
  return (
    <div className="end-actions">
      <button type="button" className="end-cta" aria-haspopup="dialog" onClick={reader.openBilan}>
        <span className="row-icon"><Icon name="quiz" /></span>
        <span className="row-text"><b>{t.lim.bilanCta}</b><small>{t.lim.bilanCtaSub}</small></span>
        <Icon name="chevron" className="row-chevron" />
      </button>
      {canReformulate && (
        <button type="button" className="end-cta end-cta-quiet" aria-haspopup="dialog" onClick={reader.openReformulate}>
          <span className="row-icon"><Icon name="refresh" /></span>
          <span className="row-text"><b>{t.lim.reformulate}</b><small>{t.lim.reformulateSub}</small></span>
          <Icon name="chevron" className="row-chevron" />
        </button>
      )}
    </div>
  );
}
