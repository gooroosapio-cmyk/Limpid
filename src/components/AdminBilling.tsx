import { grantCreditsAction, reconcileOrdersAction, setSignupOpen } from "@/app/admin/actions";
import { formatXof, PRODUCT_CODES } from "@/lib/billing/catalog";
import { chariowConfigured, productIds } from "@/lib/billing/chariow";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Administration des paiements et des crédits (§ 20) : inscriptions, configuration Chariow,
 * commandes récentes, réceptions de webhooks, ajout de crédits motivé. Aucun document client.
 */
export async function AdminBilling({ siteUrl }: { siteUrl: string }) {
  const db = adminClient();
  const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [{ data: settings }, { data: orders }, { data: inbox }, { data: paid }, { data: lots }] = await Promise.all([
    db.from("app_settings").select("signup_open").single(),
    db.from("payment_intents").select("order_ref, product_code, amount_xof, status, review_reason, created_at").order("created_at", { ascending: false }).limit(15),
    db.from("webhook_inbox").select("event, status, is_test, received_at").order("received_at", { ascending: false }).limit(10),
    db.from("payment_intents").select("amount_xof").eq("status", "succeeded").gte("created_at", month),
    db.from("credit_lots").select("origin, quantity, available, reserved, consumed").gte("created_at", month),
  ]);
  const ids = productIds();
  const mapped = PRODUCT_CODES.filter((c) => ids[c]).length;
  const revenue = (paid ?? []).reduce((n, r) => n + (r.amount_xof as number), 0);
  const sum = (k: "quantity" | "consumed" | "reserved") => (lots ?? []).reduce((n, l) => n + (l[k] as number), 0);
  const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" });

  return (
    <section className="card" aria-labelledby="billing-h">
      <h2 id="billing-h">Paiements et crédits</h2>

      <form action={setSignupOpen} className="stack-form">
        <label className="check">
          <input type="checkbox" name="open" defaultChecked={settings?.signup_open === true} />
          Inscriptions publiques ouvertes (offre gratuite : 80 crédits par mois, 2 rapports par semaine)
        </label>
        <button type="submit" className="btn">Enregistrer</button>
      </form>

      <h3>Configuration Chariow</h3>
      <dl className="usage">
        <dt>Clé API et secret du Pulse</dt>
        <dd>{chariowConfigured() ? "✓" : "manquants"}</dd>
        <dt>Produits reliés</dt>
        <dd>{mapped} / {PRODUCT_CODES.length}</dd>
        <dt>Boutique contrôlée</dt>
        <dd>{process.env.CHARIOW_STORE_ID ? "✓" : "non"}</dd>
        <dt>Adresse du webhook</dt>
        <dd>{siteUrl}/api/webhooks/chariow</dd>
      </dl>

      <h3>Ce mois-ci</h3>
      <dl className="usage">
        <dt>Encaissé (ventes confirmées)</dt>
        <dd>{formatXof(revenue)}</dd>
        <dt>Crédits attribués</dt>
        <dd>{sum("quantity")}</dd>
        <dt>Crédits consommés</dt>
        <dd>{sum("consumed")}</dd>
        <dt>Crédits réservés</dt>
        <dd>{sum("reserved")}</dd>
      </dl>

      <h3>Commandes récentes</h3>
      {(orders ?? []).length === 0 ? (
        <p className="muted">Aucune commande.</p>
      ) : (
        <ul className="rows">
          {(orders ?? []).map((o) => (
            <li key={o.order_ref as string} className="row row-static">
              <span className="row-text">
                <b>{o.product_code as string} · {formatXof(o.amount_xof as number)} · {o.status as string}</b>
                <small>{o.order_ref as string} · {when(o.created_at as string)}{o.review_reason ? ` · ${o.review_reason}` : ""}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form action={reconcileOrdersAction}>
        <button type="submit" className="btn">Rapprocher les commandes en attente</button>
      </form>

      <h3>Webhooks reçus</h3>
      {(inbox ?? []).length === 0 ? (
        <p className="muted">Aucune réception.</p>
      ) : (
        <ul className="rows">
          {(inbox ?? []).map((w, i) => (
            <li key={i} className="row row-static">
              <span className="row-text">
                <b>{w.event as string} · {w.status as string}{w.is_test ? " · test" : ""}</b>
                <small>{when(w.received_at as string)}</small>
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3>Ajouter des crédits</h3>
      <form action={grantCreditsAction} className="stack-form">
        <label htmlFor="grant-email">Adresse du compte</label>
        <input id="grant-email" name="email" type="email" required />
        <label htmlFor="grant-credits">Crédits (1 à 2 000, valables 12 mois)</label>
        <input id="grant-credits" name="credits" type="number" min={1} max={2000} required />
        <label htmlFor="grant-reason">Motif (journalisé)</label>
        <input id="grant-reason" name="reason" required minLength={5} maxLength={200} />
        <button type="submit" className="btn btn-primary">Ajouter</button>
      </form>
    </section>
  );
}
