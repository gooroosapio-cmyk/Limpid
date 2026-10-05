import type { Metadata } from "next";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { sessionIdOf } from "@/lib/auth/sessions";
import { getLang, getT } from "@/lib/i18n/server";
import { adminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { revokeAll, revokeDevice, revokeOthers } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.devices.title };
}

/** Navigateur et système, lisibles, à partir de l'en-tête User-Agent. */
function describe(ua: string | null): string {
  if (!ua) return "—";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navigateur";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} · ${os}` : browser;
}

/** Appareils connectés (V2, § 5) : sessions actives, déconnexion à distance. */
export default async function DevicesPage() {
  const [t, lang, user] = await Promise.all([getT(), getLang(), requireUser()]);
  const d = t.devices;
  const { data: s } = await (await createUserClient()).auth.getSession();
  const current = sessionIdOf(s.session?.access_token);
  const { data } = await adminClient()
    .from("user_sessions")
    .select("session_id, created_at, last_activity_at, user_agent")
    .eq("owner_id", user.id)
    .is("revoked_at", null)
    .order("last_activity_at", { ascending: false })
    .limit(30);
  const when = (iso: string) => new Date(iso).toLocaleString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" });

  return (
    <Screen>
      <h1>{d.title}</h1>
      <p className="lede">{d.lede}</p>
      <ul className="rows">
        {(data ?? []).map((row) => (
          <li key={row.session_id as string} className="row row-static device-row">
            <span className="row-text">
              <b>
                {describe(row.user_agent as string | null)}
                {row.session_id === current ? ` · ${d.thisDevice}` : ""}
              </b>
              <small>{d.lastActive(when(row.last_activity_at as string))} · {d.since(when(row.created_at as string))}</small>
            </span>
            <form action={revokeDevice}>
              <input type="hidden" name="session" value={row.session_id as string} />
              <button type="submit" className="btn">{d.signOut}</button>
            </form>
          </li>
        ))}
      </ul>
      <div className="actions-row">
        <form action={revokeOthers}>
          <button type="submit" className="btn">{d.signOutOthers}</button>
        </form>
        <form action={revokeAll}>
          <button type="submit" className="btn btn-danger">{d.signOutAll}</button>
        </form>
      </div>
      <p className="muted small">{d.rules}</p>
    </Screen>
  );
}
