import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { FolderError, MAX_MOVE, moveReports } from "@/lib/library/folders";

const Body = z.strictObject({
  report_ids: z.array(z.string().uuid()).min(1).max(MAX_MOVE),
  folder_id: z.string().uuid().nullable(),
  /** Annulation : seulement les Limpid encore dans ce dossier (null : bibliothèque). */
  expect_folder_id: z.string().uuid().nullable().optional(),
});

/** Déplace un ou plusieurs Limpid du compte vers un dossier (ou la bibliothèque). */
export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "requete" }, { status: 400 });
  try {
    const out = await moveReports(user.id, body.data.report_ids, body.data.folder_id, body.data.expect_folder_id);
    if (!out) return NextResponse.json({ error: "introuvable" }, { status: 404 });
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof FolderError) return NextResponse.json({ error: "stockage" }, { status: 500 });
    throw e;
  }
}
