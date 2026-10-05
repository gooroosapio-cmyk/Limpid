import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { createFolder, FolderError, FolderName } from "@/lib/library/folders";

const Body = z.strictObject({ name: FolderName });

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "requete" }, { status: 400 });
  try {
    return NextResponse.json(await createFolder(user.id, body.data.name), { status: 201 });
  } catch (e) {
    if (e instanceof FolderError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.code === "limit" ? 409 : 500 });
    throw e;
  }
}
