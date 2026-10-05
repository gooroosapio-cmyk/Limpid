import type { Metadata } from "next";
import { DeleteAccount } from "@/components/DeleteAccount";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { retention } from "@/lib/config";
import { fr } from "@/lib/i18n/fr";

export const metadata: Metadata = { title: fr.compte.dataHeading };

/** Confidentialité et données (kit V3, écran 44) : durées issues de la configuration active. */
export default async function DataPage() {
  await requireUser();
  const d = fr.compte.dataRows;
  const values: Record<string, number> = { reports: retention.reportDays, originals: retention.originalHours, text: 0, device: 0 };
  return (
    <Screen title={fr.compte.dataHeading} back="/compte">
      <h1>{fr.compte.dataHeading}</h1>
      <p className="lede">{fr.compte.dataLede}</p>
      <dl className="retention-list">
        {Object.entries(d).map(([key, [label, text]]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{text(values[key] ?? 0)}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small">{fr.compte.dataNote}</p>
      <DeleteAccount />
    </Screen>
  );
}
