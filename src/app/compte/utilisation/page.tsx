import { redirect } from "next/navigation";

/** Ancienne page « Utilisation » (limite de l'alpha) : remplacée par « Mes crédits ». */
export default function UsageRedirect() {
  redirect("/compte/credits");
}
