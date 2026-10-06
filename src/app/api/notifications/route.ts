import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";

/** Pastille de la cloche et identité affichée dans l'en-tête (nom choisi, sinon adresse). */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  if (!isAdminConfigured()) return NextResponse.json({ unread: 0, name: null });
  const [unread, { data: profile }] = await Promise.all([
    unreadCount(user.id),
    adminClient().from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);
  return NextResponse.json({ unread, name: (profile?.display_name as string | null) ?? null }, { headers: { "Cache-Control": "no-store" } });
}
