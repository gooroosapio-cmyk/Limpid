"use client";

import { useId, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { apiMessage } from "@/lib/i18n/api";

/** Pays proposés pour le téléphone (Chariow attend un code ISO à deux lettres). */
const COUNTRIES = ["CI", "SN", "BJ", "BF", "ML", "TG", "NE", "GN", "CM", "GA", "CG", "CD", "MG", "MA", "TN", "FR", "BE", "CH", "CA", "US"];

/**
 * Informations exigées par Chariow (§ 13) et passage au paiement, dans le même onglet.
 * Le montant n'est jamais envoyé : seul le code produit l'est, le serveur fixe le prix.
 */
export function CheckoutForm({ product, payLabel, lang }: { product: string; payLabel: string; lang: "fr" | "en" }) {
  const t = useT();
  const c = t.billing.checkout;
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const names = new Intl.DisplayNames([lang], { type: "region" });

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product,
        first_name: String(form.get("first_name") ?? ""),
        last_name: String(form.get("last_name") ?? ""),
        phone_number: String(form.get("phone") ?? "").replace(/\D/g, ""),
        country_code: String(form.get("country") ?? "CI"),
        idempotency_key: key,
      }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    if (res?.ok && typeof body?.checkoutUrl === "string") {
      window.location.assign(body.checkoutUrl);
      return;
    }
    setBusy(false);
    setError(apiMessage(t, body, c.failed));
  }

  return (
    <form action={submit} className="card checkout-form">
      <h2 className="small">{c.payerTitle}</h2>
      <p className="muted small">{c.payerWhy}</p>
      <label htmlFor={`${id}-fn`}>{c.firstName}</label>
      <input id={`${id}-fn`} name="first_name" autoComplete="given-name" required maxLength={50} />
      <label htmlFor={`${id}-ln`}>{c.lastName}</label>
      <input id={`${id}-ln`} name="last_name" autoComplete="family-name" required maxLength={50} />
      <label htmlFor={`${id}-co`}>{c.country}</label>
      <select id={`${id}-co`} name="country" defaultValue="CI" autoComplete="country">
        {COUNTRIES.map((cc) => <option key={cc} value={cc}>{names.of(cc) ?? cc}</option>)}
      </select>
      <label htmlFor={`${id}-ph`}>{c.phone}</label>
      <input id={`${id}-ph`} name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" required pattern="[0-9 ]{6,20}" maxLength={20} />
      {error && <p className="notice notice-warn" role="alert">{error}</p>}
      <button type="submit" className={`btn btn-primary btn-block${busy ? " busy" : ""}`} disabled={busy}>
        {busy ? c.paying : payLabel}
      </button>
      <p className="muted small">{c.redirectNote}</p>
    </form>
  );
}
