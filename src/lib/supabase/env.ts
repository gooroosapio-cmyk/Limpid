/**
 * Coordonnées publiques du projet Supabase. Ces deux valeurs sont publiques par nature
 * (clé « publishable », protégée par la RLS) ; l'environnement peut les remplacer.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://clrqerejtweemalkupig.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_M5igx8H2kJlhqq-CkC5wyA_ts2jgpmT";
