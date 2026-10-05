import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { drainQueue } from "@/lib/jobs/worker";
import { ThemeId } from "@/lib/contracts/schemas";
import { moveReport } from "@/lib/library/folders";
import { COVERS } from "@/lib/library/covers";
import { deleteReport } from "@/lib/reports/delete";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

const Id = z.string().uuid();

// La relance éventuelle de la file s'exécute après la réponse, dans cette fonction.
export const maxDuration = 300;

/**
 * État de la génération (lecture via RLS : seul le propriétaire voit sa tâche). Si la tâche
 * attend dans la file (remise en file après l'OCR, invocation interrompue), le suivi la
 * relance : la réservation atomique empêche tout double traitement.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!Id.safeParse(id).success) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("jobs")
    .select("status, stage, error_code, lease_expires_at")
    .eq("report_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const stalled =
    data.status === "queued" ||
    (data.status === "running" && !!data.lease_expires_at && new Date(data.lease_expires_at).getTime() < Date.now());
  if (stalled && isAdminConfigured()) {
    const started = Date.now();
    after(() => drainQueue(`poll-${crypto.randomUUID().slice(0, 8)}`, started + 270_000));
  }
  const { lease_expires_at: _lease, ...view } = data;
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const { id } = await ctx.params;
  if (!Id.safeParse(id).success) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const result = await deleteReport(user.id, id);
  if (result === "not_found") return NextResponse.json({ error: "introuvable" }, { status: 404 });
  return NextResponse.json({ status: result });
}

const ThemeChange = z.strictObject({ theme_id: ThemeId.nullable() });
const FolderMove = z.strictObject({ folder_id: z.string().uuid().nullable() });
/** Personnalisation (V2) : favori, couverture de la banque, titre. */
const Personalize = z
  .strictObject({
    favorite: z.boolean().optional(),
    cover_id: z.enum(COVERS).nullable().optional(),
    title: z.string().trim().min(1).max(160).optional(),
  })
  .refine((b) => Object.keys(b).length > 0);

/** Changement de présentation (null = automatique) : même contenu validé, nouveau rendu, aucun appel IA. */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const { id } = await ctx.params;
  if (!Id.safeParse(id).success) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const raw = await request.json().catch(() => null);
  // Déplacement vers un dossier (null : racine de la bibliothèque).
  const move = FolderMove.safeParse(raw);
  if (move.success) {
    return (await moveReport(user.id, id, move.data.folder_id))
      ? NextResponse.json({ folder_id: move.data.folder_id })
      : NextResponse.json({ error: "introuvable" }, { status: 404 });
  }
  const custom = Personalize.safeParse(raw);
  if (custom.success) {
    const { data, error } = await adminClient()
      .from("reports")
      .update(custom.data)
      .eq("id", id)
      .eq("owner_id", user.id)
      .is("deleted_at", null)
      .select("id, favorite, cover_id, title");
    if (error) return NextResponse.json({ error: "stockage" }, { status: 500 });
    if (!data?.length) return NextResponse.json({ error: "introuvable" }, { status: 404 });
    return NextResponse.json(data[0]);
  }
  const body = ThemeChange.safeParse(raw);
  if (!body.success) return NextResponse.json({ error: "requete" }, { status: 400 });
  const { data, error } = await adminClient()
    .from("reports")
    .update({ theme_id: body.data.theme_id })
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .select("id");
  if (error) return NextResponse.json({ error: "stockage" }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  return NextResponse.json({ theme_id: body.data.theme_id });
}
