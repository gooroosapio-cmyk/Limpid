import Link from "next/link";
import { Screen } from "@/components/shell/Screen";
import { getT } from "@/lib/i18n/server";

/** Page introuvable, dans la langue de l'interface (la page par défaut de Next est en anglais). */
export default async function NotFound() {
  const t = (await getT()).notFound;
  return (
    <Screen>
      <h1>{t.title}</h1>
      <p className="lede">{t.text}</p>
      <Link href="/" className="btn btn-primary">{t.back}</Link>
    </Screen>
  );
}
