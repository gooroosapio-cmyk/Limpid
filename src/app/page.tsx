import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ReportLink } from "@/components/ReportLink";
import { Cover } from "@/components/library/Cover";
import { LibraryMemory } from "@/components/library/LibraryMemory";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { getLang, getT } from "@/lib/i18n/server";
import { loadLibrary, whenLabel, type LibraryItem } from "@/lib/library/load";
import { onboardingRedirect, onboardingState } from "@/lib/onboarding";
import { createUserClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.v4.home.title };
}

const LIBRARY_PARAMS = ["vue", "q", "filtre", "dossier"];
const RECENT = 3;

/** Prénom affiché : premier mot du nom choisi dans le profil (jamais déduit de l'adresse). */
function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first.slice(0, 24) : null;
}

/**
 * Accueil (V4, § 1) : salutation, Créer un Limpid, Reprendre (s'il existe un contenu déjà
 * ouvert), trois récents au plus et lien Bibliothèque. Données réelles uniquement.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  // Anciennes adresses de la bibliothèque (/?filtre=…, /?vue=…) : redirigées, paramètres conservés.
  const sp = await searchParams;
  if (LIBRARY_PARAMS.some((k) => k in sp)) {
    const qs = new URLSearchParams(Object.entries(sp).filter(([k]) => LIBRARY_PARAMS.includes(k))).toString();
    redirect(`/bibliotheque?${qs}`);
  }
  const [t, lang] = await Promise.all([getT(), getLang()]);
  await requireUser();
  const supabase = await createUserClient();
  const { data: profile, error } = await supabase.from("profiles").select("display_name, onboarding_step, onboarding_done_at, tutorial_done_at").maybeSingle();
  // Lecture impossible : jamais de questionnaire imposé par erreur à un compte existant.
  const next = error ? null : onboardingRedirect(onboardingState(profile));
  if (next) redirect(next);

  const h = t.v4.home;
  const { items } = await loadLibrary({ limit: 40 });
  const byOpened = (a: LibraryItem, b: LibraryItem) => (b.openedAt ?? "").localeCompare(a.openedAt ?? "");
  const resume = items.filter((i) => i.state === "ready" && i.openedAt).sort(byOpened)[0] ?? null;
  const recent = items.filter((i) => i.id !== resume?.id).slice(0, RECENT);
  const when = (iso: string) => whenLabel(iso, lang, t.library.today, t.library.yesterday);

  return (
    <Screen className="home-page">
      <LibraryMemory />
      <h1 className="home-hello">{h.hello(firstName(profile?.display_name))}</h1>

      <Link href="/ajouter" className="home-create">
        <span className="home-create-plus" aria-hidden="true"><Icon name="plus" size={22} /></span>
        <span className="home-create-text">
          <b>{h.create}</b>
          <small>{h.createSub}</small>
        </span>
        <Icon name="arrow" className="home-create-arrow" />
      </Link>

      {resume && (
        <section aria-labelledby="home-resume-h" className="home-section">
          <h2 id="home-resume-h">{h.resume}</h2>
          <div className="home-resume">
            <Cover cover={resume.cover} className="home-thumb" eager />
            <div className="home-resume-text">
              <b>{resume.title}</b>
              <small className="meta">{h.opened(when(resume.openedAt!).toLowerCase())}</small>
            </div>
            <ReportLink href={`/rapports/${resume.id}`} className="btn btn-primary home-resume-cta">{h.continue}</ReportLink>
          </div>
        </section>
      )}

      {recent.length > 0 ? (
        <section aria-labelledby="home-recent-h" className="home-section">
          <div className="home-section-head">
            <h2 id="home-recent-h">{h.recent}</h2>
            <Link href="/bibliotheque" className="see-all">{h.seeAll} <Icon name="chevron" size={18} /></Link>
          </div>
          <ul className="home-list">
            {recent.map((i) => (
              <li key={i.id}>
                <ReportLink href={i.state === "ready" ? `/rapports/${i.id}/apercu` : `/rapports/${i.id}`} className="home-row">
                  <Cover cover={i.cover} className="home-thumb" />
                  <span className="home-row-text">
                    <b>{i.title}</b>
                    <small className="meta">
                      {i.state === "running" ? h.preparing : i.state === "failed" ? h.interrupted : when(i.createdAt)}
                    </small>
                  </span>
                  <Icon name="chevron" className="row-chevron" />
                </ReportLink>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        !resume && (
          <section className="home-empty">
            <h2>{h.emptyTitle}</h2>
            <p className="muted">{h.emptyText}</p>
            <ReportLink href="/rapports/demo" className="btn-link" immersive>{h.example}</ReportLink>
          </section>
        )
      )}

      <Link href="/bibliotheque" className="home-library-link">
        <Icon name="book" /> <span>{h.seeLibrary}</span> <Icon name="chevron" className="row-chevron" />
      </Link>
    </Screen>
  );
}
