import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { loadLibrary } from "@/lib/library/load";

/**
 * Contenu du menu latéral : dossiers et liste simple des Limpid (titre, état), via la RLS.
 * Relu par le menu à chaque changement d'écran ; aucun contenu de document.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const { folders, items } = await loadLibrary({ limit: 200 }).catch(() => ({ folders: [], items: [], error: true }));
  return NextResponse.json(
    {
      folders: folders.map((f) => ({ id: f.id, name: f.name })),
      limpids: items.map((i) => ({ id: i.id, title: i.title, state: i.state, favorite: i.favorite })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
