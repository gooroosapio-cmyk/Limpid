import type { Metadata } from "next";
import Link from "next/link";
import { Screen } from "@/components/shell/Screen";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.about.title };
}

/** À propos de nous (V4, § 14). */
export default async function AboutPage() {
  const t = await getT();
  return (
    <Screen footer>
      <h1>{t.about.title}</h1>
      <p className="lede">{t.about.lede}</p>
      <section aria-labelledby="ab-who">
        <h2 id="ab-who">{t.about.who}</h2>
        <p>{t.about.whoText}</p>
      </section>
      <section aria-labelledby="ab-how">
        <h2 id="ab-how">{t.about.how}</h2>
        <p>{t.about.howText}</p>
      </section>
      <section aria-labelledby="ab-data">
        <h2 id="ab-data">{t.about.privacy}</h2>
        <p>{t.about.privacyText}</p>
        <p><Link href="/compte/donnees">{t.about.privacyLink}</Link></p>
      </section>
      <p className="muted small">{t.about.contact}</p>
    </Screen>
  );
}
