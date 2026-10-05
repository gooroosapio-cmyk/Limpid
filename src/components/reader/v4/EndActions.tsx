"use client";

import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";
import { useAnnex } from "../annex-link";
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

/** Liens de fin vers la page Annexes (hors du carrousel). */
export function AnnexLinks() {
  const t = useT();
  const annex = useAnnex();
  const link = (hash: string, label: string) =>
    annex && (
      <a
        href={annex.href(hash, "end_more")}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey) return;
          e.preventDefault();
          annex.open(hash, "end_more");
        }}
      >
        {label}
      </a>
    );
  if (!annex) return null;
  return (
    <nav className="end-annexes" aria-label={t.lim.annexLinks}>
      {link("annexes", t.lim.optAnnexes)} · {link("sources", t.lim.optSources)} · {link("glossaire", t.lim.optGlossary)}
    </nav>
  );
}
