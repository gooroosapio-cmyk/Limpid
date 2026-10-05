import Link from "next/link";
import { DemoBanner } from "@/components/DemoBanner";
import { Icon } from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { Screen } from "@/components/shell/Screen";
import { ThemeId } from "@/lib/contracts/schemas";
import { requireUser } from "@/lib/auth";
import { autoTheme } from "@/lib/display/themes";
import { fr } from "@/lib/i18n/fr";
import { createUserClient } from "@/lib/supabase/server";

/** Accueil (kit V3, écran 01) : importer ou reprendre, sans carrousel ni parcours de leçons. */
export default async function HomePage() {
  await requireUser();
  const supabase = await createUserClient();
  const { data: last } = await supabase
    .from("reports")
    .select("id, title, created_at, theme_id, current_version_id, jobs(status, created_at)")
    .eq("is_demo", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = last?.current_version_id
    ? (await supabase.from("report_versions").select("template_id, explanation").eq("id", last.current_version_id).maybeSingle()).data
    : null;
  const job = [...((last?.jobs as { status: string; created_at: string }[] | null) ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const theme = ThemeId.safeParse(last?.theme_id).data ?? autoTheme(version?.template_id);
  const parts = (version?.explanation as { sections?: unknown[] } | null)?.sections?.length ?? 0;
  const ready = !!last?.current_version_id;

  return (
    <Screen root actions={<Link href="/bibliotheque" className="ib" aria-label="Rechercher dans la bibliothèque"><Icon name="search" /></Link>}>
      <div className="stagger hero">
        <span className="eyebrow">{fr.home.eyebrow}</span>
        <h1>{fr.home.title}</h1>
        <p className="lede">{fr.home.lede}</p>
        <DemoBanner />
        <Link href="/ajouter" className="btn btn-primary btn-block">
          <Icon name="plus" /> {fr.home.cta}
        </Link>

        {last && (
          <section aria-labelledby="resume-h">
            <h2 id="resume-h" className="eyebrow">{fr.home.resume}</h2>
            <Link href={`/rapports/${last.id}`} className="feature">
              <span className="feature-head">
                <span className="chip">{ready ? fr.themes.names[theme] : fr.home.preparing}</span>
                <LogoMark size={56} className="feature-art" />
              </span>
              <h2>{last.title}</h2>
              <span className="meta">
                {ready && parts ? `${fr.home.parts(parts)} · ` : ""}
                {new Date(last.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                {!ready && job ? ` · ${fr.reports.status[job.status] ?? job.status}` : ""}
              </span>
              <span className="go">{ready ? fr.home.continue : fr.home.preparing} <Icon name="arrow" size={18} /></span>
            </Link>
          </section>
        )}

        <section aria-labelledby="pace-h">
          <h2 id="pace-h" className="eyebrow">{fr.home.pace}</h2>
          <ul className="rows">
            {last && ready && (
              <li>
                <Link href={`/rapports/${last.id}#verifier`} className="row">
                  <span className="row-icon"><Icon name="quiz" /></span>
                  <span className="row-text"><b>{fr.home.test}</b><small>{fr.home.testSub}</small></span>
                  <Icon name="chevron" className="row-chevron" />
                </Link>
              </li>
            )}
            <li>
              <Link href="/bibliotheque" className="row">
                <span className="row-icon"><Icon name="book" /></span>
                <span className="row-text"><b>{fr.home.all}</b><small>{fr.home.allSub}</small></span>
                <Icon name="chevron" className="row-chevron" />
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </Screen>
  );
}
