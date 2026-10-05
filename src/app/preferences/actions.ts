"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
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

/**
 * Réinitialise les préférences d'explication (familiarité, objectif, exemples, approche et
 * langue des explications). Les recherches récentes de la bibliothèque sont conservées.
 */
export async function resetPreferences(): Promise<{ ok: boolean }> {
  const supabase = await createUserClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false };
  const { data: row } = await supabase.from("reader_preferences").select("recent_searches").maybeSingle();
  const { error } = await supabase.from("reader_preferences").delete().eq("owner_id", auth.user.id);
  if (error) return { ok: false };
  const recent = Array.isArray(row?.recent_searches) ? row.recent_searches : [];
  if (recent.length) await supabase.from("reader_preferences").insert({ owner_id: auth.user.id, recent_searches: recent });
  revalidatePath("/parametres");
  return { ok: true };
}

const Field = z
  .strictObject({
    familiarity: z.enum(["aucune", "bases", "maitrise"]).nullable(),
    goal: z.enum(["comprendre", "reviser", "appliquer", "decider"]).nullable(),
    example_domain: z.enum(["quotidien", "travail", "sciences", "sans_preference"]).nullable(),
    default_mode: z.enum(["tres_simple", "claire", "resume", "revision"]).nullable(),
    explanation_lang: z.enum(["fr", "en"]).nullable(),
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
  revalidatePath("/parametres");
  return { ok: !error };
}
