"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { markAllRead } from "@/lib/notifications";

/** « Tout marquer comme lu » : idempotent (seules les notifications encore non lues changent). */
export async function markAllReadAction(): Promise<void> {
  const user = await requireUser();
  await markAllRead(user.id);
  revalidatePath("/notifications");
}
