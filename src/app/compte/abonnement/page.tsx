import { redirect } from "next/navigation";

/** Ancienne page « Abonnement (bientôt) » : les offres sont sur /offres. */
export default function SubscriptionRedirect() {
  redirect("/offres");
}
