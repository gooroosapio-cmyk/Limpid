"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ThemeId } from "@/lib/contracts/schemas";
import { createUserClient } from "@/lib/supabase/server";

const one = <T extends [string, ...string[]]>(values: T) =>
  z.array(z.enum(values)).max(1).optional().transform((v) => v?.[0] ?? null);

const Answers = z.strictObject({
  goal: one(["comprendre", "reviser", "appliquer", "decider"]),
  familiarity: one(["aucune", "bases", "maitrise"]),
  aids: z.array(z.enum(["analogies", "exemples", "schemas", "texte"])).max(4).optional().transform((v) => v ?? []),
  minutes: one(["3", "7", "12"]).transform((v) => (v ? Number(v) : null)),
  density: one(["essentiel", "equilibre", "approfondi"]),
  example_domain: one(["quotidien", "travail", "sciences", "sans_preference"]),
});

/** Enregistre le profil de lecture (RLS : owner_id forcé à l'utilisateur connecté). */
export async function savePreferences(answers: unknown): Promise<{ ok: boolean }> {
  const parsed = Answers.safeParse(answers);
  if (!parsed.success) return { ok: false };
  const supabase = await createUserClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false };
  const { error } = await supabase.from("reader_preferences").upsert({ owner_id: auth.user.id, ...parsed.data });
  revalidatePath("/preferences");
  return { ok: !error };
}

export async function clearPreferences(): Promise<{ ok: boolean }> {
  const supabase = await createUserClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false };
  const { error } = await supabase.from("reader_preferences").delete().eq("owner_id", auth.user.id);
  revalidatePath("/preferences");
  return { ok: !error };
}

/** Présentation par défaut des nouveaux rapports (n'affecte pas les rapports existants). */
export async function saveTheme(theme: unknown): Promise<{ ok: boolean }> {
  const parsed = ThemeId.nullable().safeParse(theme);
  if (!parsed.success) return { ok: false };
  const supabase = await createUserClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false };
  const { error } = await supabase.from("reader_preferences").upsert({ owner_id: auth.user.id, theme_id: parsed.data });
  revalidatePath("/preferences");
  return { ok: !error };
}

const Field = z
  .strictObject({
    familiarity: z.enum(["aucune", "bases", "maitrise"]).nullable(),
    goal: z.enum(["comprendre", "reviser", "appliquer", "decider"]).nullable(),
    example_domain: z.enum(["quotidien", "travail", "sciences", "sans_preference"]).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length === 1);

/** Réglage direct d'une préférence pédagogique (écran Préférences de lecture). */
export async function savePreferenceField(input: unknown): Promise<{ ok: boolean }> {
  const parsed = Field.safeParse(input);
  if (!parsed.success) return { ok: false };
  const supabase = await createUserClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false };
  const { error } = await supabase.from("reader_preferences").upsert({ owner_id: auth.user.id, ...parsed.data });
  revalidatePath("/compte/preferences");
  return { ok: !error };
}
