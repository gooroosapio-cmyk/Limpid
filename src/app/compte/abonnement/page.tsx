import type { Metadata } from "next";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { fr } from "@/lib/i18n/fr";
import { ACCOUNT_LIMITS } from "@/lib/jobs/limits";

export const metadata: Metadata = { title: fr.compte.subscriptionHeading };

/** Abonnement (kit V3, écran 37) : aucun tarif fictif ; l'offre réelle est l'alpha gratuite. */
export default async function SubscriptionPage() {
  await requireUser();
  return (
    <Screen>
      <h1>{fr.compte.subscriptionHeading}</h1>
      <p className="lede">{fr.compte.subscriptionLede}</p>
      <dl className="usage card">
        <dt>{fr.compte.current}</dt>
        <dd>{fr.compte.currentValue}</dd>
        <dt>{fr.compte.included}</dt>
        <dd>{fr.compte.includedValue(ACCOUNT_LIMITS.dailyReports)}</dd>
      </dl>
      <div className="note">
        <b>{fr.compte.soonTitle}</b>
        <p>{fr.compte.subscriptionSoon}</p>
      </div>
    </Screen>
  );
}
