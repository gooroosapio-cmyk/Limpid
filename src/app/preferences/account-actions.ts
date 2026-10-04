"use server";

import { redirect } from "next/navigation";
import { deleteAccount } from "@/lib/account/delete";
import { createUserClient } from "@/lib/supabase/server";

export interface DeleteAccountState {
  error: string | null;
}

/** Suppression définitive du compte, après confirmation écrite. */
export async function deleteMyAccount(_prev: DeleteAccountState, form: FormData): Promise<DeleteAccountState> {
  if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "SUPPRIMER") {
    return { error: "Tapez SUPPRIMER pour confirmer." };
  }
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/connexion");

  const result = await deleteAccount(data.user.id);
  if (!result.steps.auth_user) {
    return { error: "La suppression n'a pas pu aller jusqu'au bout. Réessayez ; vos rapports ne sont déjà plus accessibles." };
  }
  // L'utilisateur n'existe plus : on efface aussi les cookies de session.
  await supabase.auth.signOut().catch(() => undefined);
  redirect("/connexion?compte=supprime");
}
