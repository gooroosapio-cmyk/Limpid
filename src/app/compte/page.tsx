import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { LinkRow } from "@/components/LinkRow";
import { Screen } from "@/components/shell/Screen";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { usageToday } from "@/lib/jobs/limits";
import { isAdminConfigured } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.nav.profile };
}

function initials(email: string): string {
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase() || "?";
}

/** Profil (kit V3, écran 29) : identité, utilisation réelle, abonnement, données et sécurité. */
export default async function AccountPage() {
  const t = await getT();
  const user = await requireUser();
  const email = user.email ?? "";
  const [admin, usage] = await Promise.all([
    isAdmin(user.id),
    isAdminConfigured() ? usageToday(user.id).catch(() => null) : Promise.resolve(null),
  ]);
  const left = usage ? Math.max(0, usage.limit - usage.used) : null;
  const r = t.compte.rows;

  return (
    <Screen>
      <div className="stagger">
        <h1>{t.nav.profile}</h1>
        <div className="profile">
          <span className="avatar avatar-lg" aria-hidden="true">{initials(email)}</span>
          <div>
            <h2>{email}</h2>
            <p>{admin ? `${t.compte.profile} · ${t.compte.admin}` : t.compte.profile}</p>
          </div>
        </div>

        {usage && left !== null && (
          <section className="card usage-card" aria-labelledby="usage-h">
            <div className="head">
              <h2 id="usage-h" className="small">{t.compte.usageTitle}</h2>
              <span className="chip">{t.compte.usageBadge}</span>
            </div>
            <p className="big">{t.compte.usageBig(left)}</p>
            <progress value={usage.used} max={usage.limit} aria-label={t.compte.usageNote(usage.used, usage.limit)} />
            <p className="muted small">{t.compte.usageNote(usage.used, usage.limit)}</p>
            <p className="center"><Link href="/compte/utilisation" className="btn-link">{t.compte.usageLink}</Link></p>
          </section>
        )}

        <ul className="rows">
          <LinkRow href="/parametres" icon="settings" title={r.settings![0]} sub={r.settings![1]} />
          <LinkRow href="/compte/abonnement" icon="star" title={r.subscription![0]} sub={r.subscription![1]} />
          <LinkRow href="/compte/utilisation" icon="clock" title={r.usage![0]} sub={r.usage![1]} />
          <LinkRow href="/compte/donnees" icon="shield" title={r.data![0]} sub={r.data![1]} />
          <LinkRow href="/compte/installer" icon="download" title={r.install![0]} sub={r.install![1]} />
          <LinkRow href="/compte/mot-de-passe" icon="eye" title={r.password![0]} sub={r.password![1]} />
          {admin && <LinkRow href="/admin" icon="shield" title={r.admin![0]} sub={r.admin![1]} />}
        </ul>
        <form action="/auth/deconnexion" method="post" className="logout-form">
          <button type="submit" className="btn btn-block"><Icon name="logout" /> {t.compte.logout}</button>
        </form>
      </div>
    </Screen>
  );
}
