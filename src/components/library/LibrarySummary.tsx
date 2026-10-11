import { Icon } from "@/components/Icon";
import type { LibraryItem } from "@/lib/library/load";
import { librarySummary } from "@/lib/library/home";
import { getT } from "@/lib/i18n/server";

/** Kit V4 : nombre de contenus (prêts, en cours) et progression de lecture (cours ouverts / prêts). */
export async function LibrarySummary({ items }: { items: LibraryItem[] }) {
  const t = await getT();
  const s = librarySummary(items);
  if (!s.total) return null;
  const r = 22;
  const c = 2 * Math.PI * r;
  const pct = s.ready ? Math.round((s.read / s.ready) * 100) : 0;
  return (
    <section className="lib-summary" aria-label={t.v4.library.summaryLabel}>
      <div className="lib-summary-part">
        <span className="lib-summary-icon" aria-hidden="true"><Icon name="book" size={22} /></span>
        <span>
          <b>{t.v4.library.contents(s.total)}</b>
          <small>{t.v4.library.readyRunning(s.ready, s.running)}</small>
        </span>
      </div>
      <div className="lib-summary-part">
        <span className="lib-ring" role="img" aria-label={t.v4.library.progressAria(pct)}>
          <svg viewBox="0 0 52 52" aria-hidden="true">
            <circle className="track" cx="26" cy="26" r={r} />
            <circle className="value" cx="26" cy="26" r={r} strokeDasharray={`${(c * pct) / 100} ${c}`} />
          </svg>
          <span aria-hidden="true">{pct}%</span>
        </span>
        <span>
          <b>{t.v4.library.progress}</b>
          <small>{t.v4.library.readOf(s.read, s.ready)}</small>
        </span>
      </div>
    </section>
  );
}
