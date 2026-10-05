import { NextResponse, type NextRequest } from "next/server";
import { sessionIdOf } from "@/lib/auth/sessions";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

/** Déconnexion : la session de cet appareil est close côté serveur, puis les cookies effacés. */
export async function POST(request: NextRequest) {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getSession();
  const sid = sessionIdOf(data.session?.access_token);
  if (sid && isAdminConfigured()) {
    await adminClient().from("user_sessions").update({ revoked_at: new Date().toISOString(), revoked_reason: "logout" }).eq("session_id", sid).is("revoked_at", null);
  }
  await supabase.auth.signOut({ scope: "local" });
  const res = NextResponse.redirect(new URL("/connexion", request.nextUrl.origin), { status: 303 });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
