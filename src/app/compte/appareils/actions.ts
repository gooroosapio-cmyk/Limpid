"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { sessionIdOf } from "@/lib/auth/sessions";
import { adminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

async function currentSessionId(): Promise<string | null> {
  const { data } = await (await createUserClient()).auth.getSession();
  return sessionIdOf(data.session?.access_token);
}

/** Déconnecter un appareil précis : effectif à sa prochaine requête (cookies effacés là-bas). */
export async function revokeDevice(form: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(form.get("session"));
  if (!id.success) return;
  const db = adminClient();
  await db.from("user_sessions").update({ revoked_at: new Date().toISOString(), revoked_reason: "revoked" }).eq("session_id", id.data).eq("owner_id", user.id).is("revoked_at", null);
  await db.from("audit_log").insert({ actor_id: user.id, action: "session.revoke", target_kind: "session", target_id: id.data });
  if (id.data === (await currentSessionId())) {
    await (await createUserClient()).auth.signOut({ scope: "local" });
    redirect("/connexion?session=revoked");
  }
  revalidatePath("/compte/appareils");
}

/** Déconnecter tous les autres appareils (jetons de rafraîchissement révoqués chez Supabase). */
export async function revokeOthers() {
  const user = await requireUser();
  const sid = await currentSessionId();
  const db = adminClient();
  let q = db.from("user_sessions").update({ revoked_at: new Date().toISOString(), revoked_reason: "revoked" }).eq("owner_id", user.id).is("revoked_at", null);
  if (sid) q = q.neq("session_id", sid);
  await q;
  await (await createUserClient()).auth.signOut({ scope: "others" });
  await db.from("audit_log").insert({ actor_id: user.id, action: "session.revoke_others", target_kind: "session", target_id: null });
  revalidatePath("/compte/appareils");
}

/** Déconnecter tous les appareils, celui-ci compris. */
export async function revokeAll() {
  const user = await requireUser();
  await adminClient().from("user_sessions").update({ revoked_at: new Date().toISOString(), revoked_reason: "revoked" }).eq("owner_id", user.id).is("revoked_at", null);
  await (await createUserClient()).auth.signOut({ scope: "global" });
  await adminClient().from("audit_log").insert({ actor_id: user.id, action: "session.revoke_all", target_kind: "session", target_id: null });
  redirect("/connexion?session=revoked");
}
