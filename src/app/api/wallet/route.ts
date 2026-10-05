import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getWallet } from "@/lib/billing/wallet";
import { isAdminConfigured } from "@/lib/supabase/admin";

/** Solde public du compte connecté (§ 8) : aucun coût fournisseur, aucun identifiant interne. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  if (!isAdminConfigured()) return NextResponse.json({ error: "non_configure" }, { status: 503 });
  const w = await getWallet(user.id);
  return NextResponse.json(
    {
      available: w.available,
      reserved: w.reserved,
      next_expiry: w.nextExpiry,
      plan: w.plan,
      mode: w.mode,
      access_ends_at: w.accessEndsAt,
      next_grant: w.nextGrant,
      quotas: w.quotas,
      at: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
