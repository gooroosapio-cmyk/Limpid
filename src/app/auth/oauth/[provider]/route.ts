import { NextResponse, type NextRequest } from "next/server";
import { enabledProviders, isOAuthProvider, OAUTH_SCOPES } from "@/lib/auth/oauth";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Démarre la connexion Google ou Apple. Lien (GET) et non formulaire : la CSP « form-action
 * 'self' » bloquerait la redirection vers le fournisseur après un envoi de formulaire.
 * Le retour passe par /auth/callback (échange PKCE), comme les liens email.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const origin = request.nextUrl.origin;
  if (!isOAuthProvider(provider) || !enabledProviders().includes(provider)) {
    return NextResponse.redirect(new URL("/connexion", origin), { status: 303 });
  }
  const site = (process.env.LIMPID_SITE_URL ?? origin).replace(/\/$/, "");
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${site}/auth/callback`, scopes: OAUTH_SCOPES[provider], skipBrowserRedirect: true },
  });
  if (error || !data.url) {
    console.error("oauth.start", provider, error?.status, error?.code);
    return NextResponse.redirect(new URL("/connexion?erreur=oauth", origin), { status: 303 });
  }
  const res = NextResponse.redirect(data.url, { status: 303 });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
