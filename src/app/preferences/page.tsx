import type { Metadata } from "next";
import { PreferencesQuiz } from "@/components/PreferencesQuiz";
import { fr } from "@/lib/i18n/fr";

export const metadata: Metadata = { title: fr.preferences.title };

export default function PreferencesPage() {
  return (
    <>
      <h1>{fr.preferences.title}</h1>
      <p className="muted">{fr.preferences.intro}</p>
      <PreferencesQuiz />
    </>
  );
}
