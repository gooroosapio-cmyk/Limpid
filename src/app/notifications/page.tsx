import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { getWallet } from "@/lib/billing/wallet";
import { getLang, getT } from "@/lib/i18n/server";
import { whenLabel } from "@/lib/library/load";
import { listNotifications, markAllRead } from "@/lib/notifications";
import { isAdminConfigured } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.notifications.title };
}

/** Notifications (V2.1) : faits réels du compte ; ouvrir la page les marque comme lues. */
export default async function NotificationsPage() {
  const [t, lang, user] = await Promise.all([getT(), getLang(), requireUser()]);
  const n = t.notifications;
  if (!isAdminConfigured()) return <Screen><h1>{n.title}</h1><p className="muted">{n.empty}</p></Screen>;
  const [items, wallet] = await Promise.all([listNotifications(user.id), getWallet(user.id).catch(() => null)]);
  await markAllRead(user.id);
  const day = (iso: string) => new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", timeZone: "Africa/Abidjan" });
  // Offre bientôt terminée (3 jours) : calculée à la lecture, jamais stockée.
  const ending = wallet?.mode === "subscription" && wallet.accessEndsAt && new Date(wallet.accessEndsAt).getTime() - Date.now() < 3 * 86_400_000 ? wallet.accessEndsAt : null;

  const rows: { key: string; icon: IconName; text: string; when: string | null; href: string | null; unread: boolean; tone?: string }[] = [
    ...(ending ? [{ key: "ending", icon: "clock" as IconName, text: n.planExpiring(day(ending)), when: null, href: "/offres", unread: true }] : []),
    ...items.map((i) => {
      const title = typeof i.data.title === "string" ? i.data.title : null;
      const plan = typeof i.data.plan === "string" ? (t.billing.planNames[i.data.plan] ?? i.data.plan) : "";
      const map = {
        report_ready: { icon: "check" as IconName, text: title ? n.reportReady(title) : n.reportReadyAnon, href: i.reportId ? `/rapports/${i.reportId}/apercu` : null },
        report_failed: { icon: "alert" as IconName, text: n.reportFailed, href: "/?vue=preparations&filtre=a_verifier", tone: "danger" },
        credits_added: { icon: "star" as IconName, text: n.creditsAdded(Number(i.data.credits ?? 0)), href: "/compte/credits" },
        plan_started: { icon: "star" as IconName, text: n.planStarted(plan), href: "/compte/credits" },
        plan_expiring: { icon: "clock" as IconName, text: "", href: "/offres" },
      }[i.kind];
      return { key: i.id, ...map, when: whenLabel(i.createdAt, lang, t.library.today, t.library.yesterday), unread: i.unread };
    }),
  ];

  return (
    <Screen>
      <div className="page-title">
        <h1>{n.title}</h1>
        <p>{n.lede}</p>
      </div>
      {rows.length === 0 ? (
        <p className="muted">{n.empty}</p>
      ) : (
        <ul className="rows notif-list">
          {rows.map((r) => {
            const body = (
              <>
                <span className={`row-icon${r.tone === "danger" ? " is-danger" : ""}`}><Icon name={r.icon} /></span>
                <span className="row-text"><b>{r.text}</b>{r.when && <small>{r.when}</small>}</span>
                {r.unread && <span className="notif-dot" role="img" aria-label={t.library.unread} />}
                {r.href && <Icon name="chevron" className="row-chevron" />}
              </>
            );
            return <li key={r.key}>{r.href ? <Link href={r.href} className="row">{body}</Link> : <div className="row row-static">{body}</div>}</li>;
          })}
        </ul>
      )}
    </Screen>
  );
}
