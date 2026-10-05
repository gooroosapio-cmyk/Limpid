import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { InstallPanel } from "@/components/account/InstallPanel";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.pwa.installTitle };
}

/** Installer Limpid (kit V3, écran 41) : progressif et facultatif, jamais de faux bouton natif. */
export default async function InstallPage() {
  const t = await getT();
  await requireUser();
  return (
    <Screen>
      <img src="/icons/limpid-192.png" alt="" width={88} height={88} className="app-icon" />
      <h1>{t.pwa.installHeading}</h1>
      <p className="lede">{t.pwa.installLede}</p>
      <ul className="rows">
        {t.pwa.benefits.map((b) => (
          <li key={b} className="row row-static">
            <span className="row-icon"><Icon name="check" /></span>
            <span className="row-text"><b>{b}</b></span>
          </li>
        ))}
      </ul>
      <InstallPanel />
    </Screen>
  );
}
