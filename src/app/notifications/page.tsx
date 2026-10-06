import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { Illustration } from "@/components/Illustration";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { getWallet } from "@/lib/billing/wallet";
import { getLang, getT } from "@/lib/i18n/server";
import { listNotifications, type NotificationView } from "@/lib/notifications";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { nowMs } from "@/lib/time";
import { markAllReadAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.notifications.title };
}

const TZ = "Africa/Abidjan";

/**
 * Notifications (V4, § 9) : liste compacte groupée (Aujourd'hui / Plus tôt), point non lu
 * issu des données, « Tout marquer comme lu » explicite et idempotent. Aucune notification
 * fictive ; l'offre bientôt terminée est calculée à la lecture.
 */
export default async function NotificationsPage() {
  const [t, lang, user] = await Promise.all([getT(), getLang(), requireUser()]);
  const n = t.notifications;
  const v = t.v4.notifications;
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  let items: NotificationView[] = [];
  let failed = false;
  if (isAdminConfigured()) {
    try {
      items = await listNotifications(user.id);
    } catch {
      failed = true;
    }
  }
  const wallet = isAdminConfigured() ? await getWallet(user.id).catch(() => null) : null;
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "long", timeZone: TZ });
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const today = new Date(nowMs()).toLocaleDateString("en-CA", { timeZone: TZ });
  const isToday = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ }) === today;
  const ending = wallet?.mode === "subscription" && wallet.accessEndsAt && new Date(wallet.accessEndsAt).getTime() - nowMs() < 3 * 86_400_000 ? wallet.accessEndsAt : null;

  type Row = { key: string; icon: IconName; title: string; detail: string | null; date: string; today: boolean; href: string | null; unread: boolean; danger?: boolean };
  const rows: Row[] = [
    ...(ending ? [{ key: "ending", icon: "clock" as IconName, title: v.planEnding, detail: n.planExpiring(day(ending)), date: "", today: true, href: "/offres", unread: false }] : []),
    ...items.map((i): Row => {
      const title = typeof i.data.title === "string" ? i.data.title : null;
      const plan = typeof i.data.plan === "string" ? (t.billing.planNames[i.data.plan] ?? i.data.plan) : "";
      const base = { key: i.id, date: isToday(i.createdAt) ? time(i.createdAt) : `${day(i.createdAt)} · ${time(i.createdAt)}`, today: isToday(i.createdAt), unread: i.unread };
      switch (i.kind) {
        case "report_ready":
          return { ...base, icon: "check", title: v.ready, detail: title, href: i.reportId ? `/rapports/${i.reportId}/apercu` : null };
        case "report_failed":
          return { ...base, icon: "alert", title: v.failed, detail: v.failedDetail, href: "/bibliotheque?vue=preparations&filtre=a_verifier", danger: true };
        case "credits_added":
          return { ...base, icon: "star", title: v.credits, detail: n.creditsAdded(Number(i.data.credits ?? 0)), href: "/compte/credits" };
        default:
          return { ...base, icon: "star", title: v.plan, detail: n.planStarted(plan), href: "/compte/credits" };
      }
    }),
  ];
  const groups = [
    { key: "today", label: v.today, rows: rows.filter((r) => r.today) },
    { key: "earlier", label: v.earlier, rows: rows.filter((r) => !r.today) },
  ].filter((g) => g.rows.length > 0);
  const unread = items.some((i) => i.unread);

  return (
    <Screen className="notif-page">
      <div className="notif-head">
        <h1>{n.title}</h1>
        {unread && (
          <form action={markAllReadAction}>
            <button type="submit" className="btn-link notif-markall">{v.markAll}</button>
          </form>
        )}
      </div>
      {failed ? (
        <div className="notice notice-error" role="alert">
          <p>{v.loadFailed}</p>
          <Link href="/notifications" className="btn">{v.retry}</Link>
        </div>
      ) : rows.length === 0 ? (
        <section className="notif-empty">
          <Illustration name="bibliotheque-vide" fallback="lumiere" className="notif-empty-art" />
          <h2>{v.emptyTitle}</h2>
          <p className="meta">{v.emptyText}</p>
          <Link href="/" className="btn">{v.home}</Link>
        </section>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="notif-group" aria-labelledby={`notif-${g.key}`}>
            <h2 id={`notif-${g.key}`} className="notif-group-h">{g.label}</h2>
            <ul className="notif-list-v4">
              {g.rows.map((r) => {
                const body = (
                  <>
                    <span className={`notif-icon${r.danger ? " is-danger" : ""}`} aria-hidden="true"><Icon name={r.icon} size={20} /></span>
                    <span className="notif-text">
                      <b>{r.title}</b>
                      {r.detail && <span className="notif-detail">{r.detail}</span>}
                      {r.date && <small className="meta">{r.date}</small>}
                    </span>
                    {r.unread && <span className="notif-dot" role="img" aria-label={t.library.unread} />}
                  </>
                );
                return <li key={r.key}>{r.href ? <Link href={r.href} className="notif-row">{body}</Link> : <div className="notif-row">{body}</div>}</li>;
              })}
            </ul>
          </section>
        ))
      )}
    </Screen>
  );
}
