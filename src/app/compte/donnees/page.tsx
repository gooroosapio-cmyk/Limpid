import type { Metadata } from "next";
import { DeleteAccount } from "@/components/DeleteAccount";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { retention } from "@/lib/config";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.compte.dataHeading };
}

/** Confidentialité et données (kit V3, écran 44) : durées issues de la configuration active. */
export default async function DataPage() {
  const t = await getT();
  await requireUser();
  const d = t.compte.dataRows;
  const values: Record<string, number> = { reports: retention.reportDays, originals: retention.originalHours, text: 0, device: 0 };
  return (
    <Screen>
      <h1>{t.compte.dataHeading}</h1>
      <p className="lede">{t.compte.dataLede}</p>
      <dl className="retention-list">
        {Object.entries(d).map(([key, [label, text]]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{text(values[key] ?? 0)}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small">{t.compte.dataNote}</p>
      <DeleteAccount />
    </Screen>
  );
}
