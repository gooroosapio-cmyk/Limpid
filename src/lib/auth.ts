/** Accès à l'utilisateur connecté côté serveur. */
import "server-only";
import { redirect } from "next/navigation";
import { createUserClient } from "@/lib/supabase/server";

export async function currentUser() {
  const supabase = await createUserClient();
  // getUser() revalide le jeton auprès de Supabase (getSession() ne le ferait pas).
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/connexion");
  return user;
}
