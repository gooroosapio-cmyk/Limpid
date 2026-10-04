import { DemoBanner } from "@/components/DemoBanner";
import { ImportForm } from "@/components/ImportForm";
import { fr } from "@/lib/i18n/fr";

export default function CreatePage() {
  return (
    <>
      <h1>{fr.create.title}</h1>
      <p className="muted">{fr.create.subtitle}</p>
      <DemoBanner />
      <ImportForm />
    </>
  );
}
