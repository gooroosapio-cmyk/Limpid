import type { Metadata } from "next";
import Link from "next/link";
import { siteUrl } from "@/lib/site";
import { AdminBilling } from "@/components/AdminBilling";
import { AdminView } from "@/components/AdminView";
import { Screen } from "@/components/shell/Screen";
import { adminOverview, requireAdmin } from "@/lib/admin";
import { adminJobs } from "@/lib/admin-jobs";
import { performance } from "@/lib/diagnostic";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Administration" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const user = await requireAdmin();
  const { message } = await searchParams;
  const [o, perf, jobs, t] = await Promise.all([adminOverview(), performance().catch(() => null), adminJobs(), getT()]);
  return (
    <Screen wide>
      <p className="tw:text-sm"><Link href="/admin/charte">{t.admin.charte.link} →</Link></p>
      <AdminView o={o} perf={perf} jobs={jobs} userEmail={user.email ?? null} message={message} />
      <AdminBilling siteUrl={siteUrl()} />
    </Screen>
  );
}
