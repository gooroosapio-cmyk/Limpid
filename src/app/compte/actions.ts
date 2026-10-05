"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

const Name = z.string().trim().max(40);

/** Nom affiché (crayon du profil) : vide = « Mon profil » et initiales de l'adresse. */
export async function updateDisplayName(form: FormData): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const parsed = Name.safeParse(form.get("name") ?? "");
  if (!parsed.success) return { ok: false };
  const { error } = await adminClient().from("profiles").update({ display_name: parsed.data || null }).eq("id", user.id);
  revalidatePath("/compte");
  revalidatePath("/parametres");
  return { ok: !error };
}
