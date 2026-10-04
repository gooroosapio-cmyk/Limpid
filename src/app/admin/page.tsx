import type { Metadata } from "next";
import { AdminView } from "@/components/AdminView";
import { adminOverview, requireAdmin } from "@/lib/admin";
import { performance } from "@/lib/diagnostic";

export const metadata: Metadata = { title: "Administration" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const user = await requireAdmin();
  const { message } = await searchParams;
  const [o, perf] = await Promise.all([adminOverview(), performance().catch(() => null)]);
  return <AdminView o={o} perf={perf} userEmail={user.email ?? null} message={message} />;
}
