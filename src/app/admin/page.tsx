import type { Metadata } from "next";
import { AdminView } from "@/components/AdminView";
import { adminOverview, requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Administration" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const user = await requireAdmin();
  const { message } = await searchParams;
  return <AdminView o={await adminOverview()} userEmail={user.email ?? null} message={message} />;
}
