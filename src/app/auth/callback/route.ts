import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { sessionMethods } from "@/lib/auth/password";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Retour d'un lien envoyé par email (connexion ou récupération) : échange le code (PKCE)
 * ou le jeton contre une session. Une session de récupération mène au choix du mot de passe.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  // Refus renvoyé par le fournisseur ou par Supabase (ex. inscription fermée pour cette adresse).
  const providerError = url.searchParams.get("error");
  if (providerError && !code) {
    const closed = /autoris|database error saving new user/i.test(url.searchParams.get("error_description") ?? "");
    return NextResponse.redirect(new URL(`/connexion?erreur=${closed ? "oauth_ferme" : "oauth"}`, url.origin));
  }
  const supabase = await createUserClient();

  let token: string | undefined;
  let ok = false;
  if (code) {
    const r = await supabase.auth.exchangeCodeForSession(code);
    ok = !r.error;
    token = r.data.session?.access_token;
  } else if (tokenHash && type) {
    const r = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !r.error;
    token = r.data.session?.access_token ?? undefined;
  }

  // Redirections fixes : aucun paramètre « next » contrôlé par l'URL.
  const recovery = ok && (type === "recovery" || sessionMethods(token).includes("recovery"));
  const target = !ok ? "/connexion?erreur=lien" : recovery ? "/compte/mot-de-passe" : "/";
  return NextResponse.redirect(new URL(target, url.origin));
}
