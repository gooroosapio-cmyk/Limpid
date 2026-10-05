import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { LinkRow } from "@/components/LinkRow";
import { Screen } from "@/components/shell/Screen";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { fr } from "@/lib/i18n/fr";
import { usageToday } from "@/lib/jobs/limits";
import { isAdminConfigured } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: fr.compte.title };

function initials(email: string): string {
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase() || "?";
}

/** Compte (kit V3, écran 29) : profil, utilisation réelle, confort, abonnement et données. */
export default async function AccountPage() {
  const user = await requireUser();
  const email = user.email ?? "";
  const [admin, usage] = await Promise.all([
    isAdmin(user.id),
    isAdminConfigured() ? usageToday(user.id).catch(() => null) : Promise.resolve(null),
  ]);
  const left = usage ? Math.max(0, usage.limit - usage.used) : null;
  const r = fr.compte.rows;

  return (
    <Screen root>
      <div className="stagger">
        <h1>{fr.compte.title}</h1>
        <div className="profile">
          <span className="avatar avatar-lg" aria-hidden="true">{initials(email)}</span>
          <div>
            <h2>{email}</h2>
            <p>{admin ? `${fr.compte.profile} · ${fr.compte.admin}` : fr.compte.profile}</p>
          </div>
        </div>

        {usage && left !== null && (
          <section className="card usage-card" aria-labelledby="usage-h">
            <div className="head">
              <h2 id="usage-h" className="small">{fr.compte.usageTitle}</h2>
              <span className="chip">{fr.compte.usageBadge}</span>
            </div>
            <p className="big">{fr.compte.usageBig(left)}</p>
            <progress value={usage.used} max={usage.limit} aria-label={fr.compte.usageNote(usage.used, usage.limit)} />
            <p className="muted small">{fr.compte.usageNote(usage.used, usage.limit)}</p>
            <p className="center"><Link href="/compte/utilisation" className="btn-link">{fr.compte.usageLink}</Link></p>
          </section>
        )}

        <ul className="rows">
          <LinkRow href="/compte/preferences" icon="settings" title={r.prefs![0]} sub={r.prefs![1]} />
          <LinkRow href="/compte/apparence" icon="moon" title={r.appearance![0]} sub={r.appearance![1]} />
          <LinkRow href="/compte/abonnement" icon="star" title={r.subscription![0]} sub={r.subscription![1]} />
          <LinkRow href="/compte/utilisation" icon="clock" title={r.usage![0]} sub={r.usage![1]} />
          <LinkRow href="/compte/donnees" icon="shield" title={r.data![0]} sub={r.data![1]} />
          <LinkRow href="/compte/installer" icon="download" title={r.install![0]} sub={r.install![1]} />
          <LinkRow href="/compte/mot-de-passe" icon="eye" title={r.password![0]} sub={r.password![1]} />
          {admin && <LinkRow href="/admin" icon="shield" title={r.admin![0]} sub={r.admin![1]} />}
        </ul>
        <form action="/auth/deconnexion" method="post" className="logout-form">
          <button type="submit" className="btn btn-block"><Icon name="logout" /> {fr.compte.logout}</button>
        </form>
      </div>
    </Screen>
  );
}
