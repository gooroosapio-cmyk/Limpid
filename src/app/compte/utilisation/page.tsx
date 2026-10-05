import type { Metadata } from "next";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { ACCOUNT_LIMITS, usageToday } from "@/lib/jobs/limits";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.compte.usageHeading };
}

/** Utilisation (kit V3, écran 38) : mesures serveur uniquement, sans estimation. */
export default async function UsagePage() {
  const t = await getT();
  const user = await requireUser();
  const supabase = await createUserClient();
  const [usage, { count }] = await Promise.all([
    isAdminConfigured() ? usageToday(user.id).catch(() => null) : Promise.resolve(null),
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("is_demo", false),
  ]);
  const u = t.compte.usageRows;
  return (
    <Screen>
      <h1>{t.compte.usageHeading}</h1>
      <p className="lede">{t.compte.usageLede}</p>
      {usage && <progress value={usage.used} max={usage.limit} aria-label={t.compte.usageNote(usage.used, usage.limit)} />}
      <dl className="usage card">
        {usage && (
          <>
            <dt>{u.day}</dt>
            <dd>{usage.used}</dd>
          </>
        )}
        <dt>{u.limit}</dt>
        <dd>{ACCOUNT_LIMITS.dailyReports}</dd>
        <dt>{u.active}</dt>
        <dd>{ACCOUNT_LIMITS.activeJobs}</dd>
        <dt>{u.reports}</dt>
        <dd>{count ?? 0}</dd>
      </dl>
      <p className="muted small">{t.compte.usageCredit}</p>
    </Screen>
  );
}
