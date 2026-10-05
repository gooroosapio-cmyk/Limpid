import { redirect } from "next/navigation";

/** Ancienne adresse (V2) : les préférences sont dans le Compte. */
export default function PreferencesRedirect() {
  redirect("/parametres");
}
