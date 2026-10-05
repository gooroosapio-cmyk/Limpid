"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";
import { matchesQuery } from "@/lib/library/search";

export interface GlossaryItem {
  id: string;
  term: string;
  definition: string;
  refs: { n: number; href: string }[];
}

/** Au-delà de ce nombre de termes, un filtre local (sans réseau ni IA) est proposé. */
const FILTER_FROM = 12;

/** Glossaire de la page Annexes : un terme = une ancre ; filtre local pour les longs glossaires. */
export function GlossaryList({ items }: { items: GlossaryItem[] }) {
  const t = useT();
  const [q, setQ] = useState("");
  const shown = useMemo(() => (q.trim() ? items.filter((g) => matchesQuery(`${g.term} ${g.definition}`, q)) : items), [items, q]);
  return (
    <>
      {items.length > FILTER_FROM && (
        <div className="searchbox annex-filter" role="search">
          <Icon name="search" />
          <label htmlFor="glo-q" className="sr-only">{t.lim.annexFilter}</label>
          <input id="glo-q" type="search" value={q} placeholder={t.lim.annexFilter} autoComplete="off" maxLength={60} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      {shown.length === 0 ? (
        <p className="muted" role="status">{t.lim.annexFilterNone}</p>
      ) : (
        <dl className="glossary annex-glossary">
          {shown.map((g) => (
            <div key={g.id} id={g.id} className="annex-target">
              <dt>{g.term}</dt>
              <dd>
                {g.definition}
                {g.refs.length > 0 && (
                  <span className="refs">
                    {g.refs.map((r) => (
                      <a key={r.n} className="ref" href={r.href} aria-label={t.reader.seeSource(r.n)}>{r.n}</a>
                    ))}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
