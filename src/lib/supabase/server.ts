/**
 * Client Supabase lié à la session de l'utilisateur (cookies). Toutes ses lectures
 * passent par la RLS : il ne voit que les données de l'utilisateur connecté.
 */
import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

export async function createUserClient() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Appel depuis un composant serveur : le proxy rafraîchit déjà la session.
        }
      },
    },
  });
}
