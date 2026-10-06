import { redirect } from "next/navigation";

/** Ancienne adresse de l'import : l'Accueil est désormais l'écran d'import (onglet conservé). */
export default async function AddRedirect({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  redirect(mode ? `/?mode=${encodeURIComponent(mode)}` : "/");
}
