import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { isInteractive, sessionExempt, sessionIdOf, sessionPolicyOn, type SessionStatus } from "@/lib/auth/sessions";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";

/**
 * En-têtes de sécurité et CSP stricte avec nonce par requête (payload 1, § 6).
 * Aucun script ni style inline sans nonce ; aucune ressource externe.
 */
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data: https://images.unsplash.com",
    "font-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    `connect-src 'self' ${SUPABASE_URL}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Pas de upgrade-insecure-requests : HSTS couvre la production, et la directive
    // casserait les recettes locales en http.
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  // Cookies posés par Supabase (rafraîchissement, déconnexion), reportés sur la réponse finale.
  const cookieWrites: { name: string; value: string; options: Parameters<typeof response.cookies.set>[2] }[] = [];

  // Rafraîchit la session Supabase (cookies) avant le rendu des pages serveur.
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        requestHeaders.set("cookie", request.cookies.toString());
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, options);
          cookieWrites.push({ name, value, options });
        }
      },
    },
  });
  if (request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) {
    const { data } = await supabase.auth.getUser();
    const path = request.nextUrl.pathname;
    // Sessions d'appareil : 7 jours d'inactivité, 90 jours au plus (admin : 30 min, 12 h).
    if (data.user && sessionPolicyOn() && isAdminConfigured() && !sessionExempt(path)) {
      const { data: s } = await supabase.auth.getSession();
      const sid = sessionIdOf(s.session?.access_token);
      if (sid) {
        const { data: status, error } = await adminClient().rpc("touch_session", {
          p_session: sid,
          p_owner: data.user.id,
          p_user_agent: (request.headers.get("user-agent") ?? "").slice(0, 200),
          p_interactive: isInteractive(request.method, request.headers, path),
        });
        // Base indisponible : on n'enferme personne dehors (journalisé).
        if (error) console.error("touch_session", error.code);
        else if (status !== "ok") {
          await supabase.auth.signOut({ scope: "local" });
          const ended = path.startsWith("/api/")
            ? NextResponse.json({ error: "session_expiree", reason: status as SessionStatus }, { status: 401 })
            : NextResponse.redirect(new URL(`/connexion?session=${status as SessionStatus}`, request.nextUrl.origin), { status: 303 });
          for (const c of cookieWrites) ended.cookies.set(c.name, c.value, c.options);
          ended.headers.set("Cache-Control", "no-store");
          return ended;
        }
      }
    }
  }

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (!isDev) response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  return response;
}

export const config = {
  matcher: [
    // Aucune exception sur les en-têtes « préchargement » : ils viennent du client, et le
    // contrôle des sessions doit s'appliquer à toute requête (sans la prolonger, cf. isInteractive).
    { source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.webmanifest|icons/|fonts/).*)" },
  ],
};
