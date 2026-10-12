import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { getWallet } from "@/lib/billing/wallet";
import { loadLibrary } from "@/lib/library/load";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Contenu du menu latéral (prompt « Fluidité », § 8) : compte et solde réels, dossiers avec
 * leur nombre de cours, deux ou trois cours récents, accès admin pour le seul compte autorisé
 * (rôle lu en base). Aucun contenu de document.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const [{ folders, items }, wallet, admin, profile] = await Promise.all([
    loadLibrary({ limit: 200 }).catch(() => ({ folders: [], items: [] })),
    isAdminConfigured() ? getWallet(user.id).catch(() => null) : null,
    isAdmin(user.id).catch(() => false),
    createUserClient().then((s) => s.from("profiles").select("display_name").maybeSingle()).then((r) => r.data).catch(() => null),
  ]);
  const counts = new Map<string, number>();
  for (const i of items) if (i.folderId) counts.set(i.folderId, (counts.get(i.folderId) ?? 0) + 1);
  const recent = [...items]
    .sort((a, b) => (b.openedAt ?? b.createdAt).localeCompare(a.openedAt ?? a.createdAt))
    .slice(0, 3)
    .map((i) => ({ id: i.id, title: i.title, state: i.state, cover: i.cover }));
  return NextResponse.json(
    {
      name: (profile?.display_name as string | null) ?? null,
      email: user.email ?? null,
      credits: wallet ? wallet.available : null,
      admin,
      folders: folders.map((f) => ({ id: f.id, name: f.name, count: counts.get(f.id) ?? 0 })),
      recent,
    },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
