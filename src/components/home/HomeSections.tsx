import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Cover } from "@/components/library/Cover";
import type { LibraryItem } from "@/lib/library/load";
import { recentItems, resumeItem } from "@/lib/library/home";
import { getLang, getT } from "@/lib/i18n/server";

/**
 * Accueil (kit V4) : « Reprendre » (dernier cours ouvert) et « Récents » (trois derniers
 * créés, hors cours à reprendre). Rien n'est affiché tant que la bibliothèque est vide.
 */
export async function HomeSections({ items }: { items: LibraryItem[] }) {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const resume = resumeItem(items);
  const recent = recentItems(items, resume);
  const date = (iso: string) => new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short", year: "numeric" });
  if (!resume && !recent.length) return null;
  return (
    <>
      {resume && (
        <section className="home-section" aria-labelledby="home-resume">
          <div className="home-section-head">
            <h2 id="home-resume">{t.home.resume}</h2>
            <Link href="/bibliotheque" className="home-see-all">{t.home.seeAll} <Icon name="chevron" size={16} /></Link>
          </div>
          <div className="home-resume">
            <Cover cover={resume.cover} className="home-thumb" />
            <div className="home-resume-text">
              <h3>{resume.title}</h3>
              <p>{t.home.sources(resume.sourceCount)} · {date(resume.createdAt)}</p>
            </div>
            <Link href={`/rapports/${resume.id}`} className="btn btn-primary btn-compact">{t.home.resumeCta}</Link>
          </div>
        </section>
      )}
      {recent.length > 0 && (
        <section className="home-section" aria-labelledby="home-recent">
          <div className="home-section-head">
            <h2 id="home-recent">{t.home.recent}</h2>
            <Link href="/bibliotheque" className="home-see-all">{t.home.seeAll} <Icon name="chevron" size={16} /></Link>
          </div>
          <ul className="home-recent">
            {recent.map((i) => (
              <li key={i.id}>
                <Link href={`/rapports/${i.id}`} className="home-recent-row">
                  <Cover cover={i.cover} className="home-thumb" />
                  <span className="home-recent-text">
                    <b>{i.title}</b>
                    <small>{i.state === "running" ? t.home.statusRunning : `${t.home.sources(i.sourceCount)} · ${date(i.createdAt)}`}</small>
                  </span>
                  <Icon name="chevron" size={20} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
