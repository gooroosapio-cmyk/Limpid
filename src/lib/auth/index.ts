/** Accès à l'utilisateur connecté côté serveur. */
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createUserClient } from "@/lib/supabase/server";

/** Une seule vérification par requête (mise en page et page partagent le résultat). */
export const currentUser = cache(async () => {
  const supabase = await createUserClient();
  // getUser() revalide le jeton auprès de Supabase (getSession() ne le ferait pas).
  const { data } = await supabase.auth.getUser();
  return data.user;
});

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/connexion");
  return user;
}
