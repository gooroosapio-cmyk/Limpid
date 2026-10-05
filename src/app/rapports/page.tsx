import { redirect } from "next/navigation";

/** Ancienne adresse (V2) : la liste des rapports est dans la Bibliothèque. */
export default function ReportsRedirect() {
  redirect("/bibliotheque");
}
