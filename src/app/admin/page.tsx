import type { Metadata } from "next";
import { AdminView } from "@/components/AdminView";
import { Screen } from "@/components/shell/Screen";
import { adminOverview, requireAdmin } from "@/lib/admin";
import { adminJobs } from "@/lib/admin-jobs";
import { performance } from "@/lib/diagnostic";

export const metadata: Metadata = { title: "Administration" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const user = await requireAdmin();
  const { message } = await searchParams;
  const [o, perf, jobs] = await Promise.all([adminOverview(), performance().catch(() => null), adminJobs()]);
  return (
    <Screen wide>
      <AdminView o={o} perf={perf} jobs={jobs} userEmail={user.email ?? null} message={message} />
    </Screen>
  );
}
