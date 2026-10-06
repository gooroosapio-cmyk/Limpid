import type { Metadata } from "next";
import { Tutorial } from "@/components/onboarding/Tutorial";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.v4.tutorial.title };
}

/** Tutoriel en trois étapes (V4, § 10) : ignorable, rejouable depuis l'Aide (Paramètres). */
export default async function TutorialPage() {
  await requireUser();
  return (
    <div className="page onboarding-page">
      <Tutorial />
    </div>
  );
}
