import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { CheckoutRequest, PurchaseError, startCheckout } from "@/lib/billing/purchase";
import { getT } from "@/lib/i18n/server";
import { isAdminConfigured } from "@/lib/supabase/admin";

export const maxDuration = 60;

/** Prépare le paiement Chariow d'un produit du catalogue pour le compte connecté (§ 13). */
export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const t = (await getT()).billing.checkout;
  if (!isAdminConfigured()) return NextResponse.json({ error: "not_configured", message: t.notConfigured }, { status: 503 });
  const parsed = CheckoutRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid", message: t.invalid }, { status: 400 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  try {
    const out = await startCheckout({ id: user.id, email: user.email ?? null, emailConfirmed: !!user.email_confirmed_at }, parsed.data, ip);
    return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof PurchaseError) {
      const map = {
        unknown_product: [404, t.unknownProduct],
        not_configured: [503, t.notConfigured],
        unverified: [403, t.verifyFirst],
        already_purchased: [409, t.alreadyPurchased],
        rejected: [422, t.invalid],
        failed: [502, t.failed],
        busy: [409, t.busy],
      } as const;
      const [status, message] = map[e.code];
      return NextResponse.json({ error: e.code, message }, { status });
    }
    console.error("checkout", (e as Error).name);
    return NextResponse.json({ error: "failed", message: t.failed }, { status: 500 });
  }
}
