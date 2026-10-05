import { redirect } from "next/navigation";

/** Réglages regroupés dans Paramètres. */
export default function SettingsRedirect() {
  redirect("/parametres");
}
