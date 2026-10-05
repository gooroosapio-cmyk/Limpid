import type { Metadata } from "next";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { ACCOUNT_LIMITS } from "@/lib/jobs/limits";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.compte.subscriptionHeading };
}

/** Abonnement (kit V3, écran 37) : aucun tarif fictif ; l'offre réelle est l'alpha gratuite. */
export default async function SubscriptionPage() {
  const t = await getT();
  await requireUser();
  return (
    <Screen>
      <h1>{t.compte.subscriptionHeading}</h1>
      <p className="lede">{t.compte.subscriptionLede}</p>
      <dl className="usage card">
        <dt>{t.compte.current}</dt>
        <dd>{t.compte.currentValue}</dd>
        <dt>{t.compte.included}</dt>
        <dd>{t.compte.includedValue(ACCOUNT_LIMITS.dailyReports)}</dd>
      </dl>
      <div className="note">
        <b>{t.compte.soonTitle}</b>
        <p>{t.compte.subscriptionSoon}</p>
      </div>
    </Screen>
  );
}
