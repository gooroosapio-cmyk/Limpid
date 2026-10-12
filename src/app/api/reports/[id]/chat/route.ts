import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { billingResponse } from "@/lib/billing/errors";
import { ChatSend, chatHistory, chatMessage, sendChat, type ChatEvent, type ChatMessageView } from "@/lib/chat/service";
import { getLang, getT } from "@/lib/i18n/server";
import { READER_AI_STATUS, ReaderAIError } from "@/lib/reports/ai-call";
import { isAdminConfigured } from "@/lib/supabase/admin";

export const maxDuration = 90;

const Id = z.string().uuid();

/** Fil conservé du chat de ce Limpid (30 derniers messages). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const { id } = await ctx.params;
  if (!Id.safeParse(id).success) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  if (!isAdminConfigured()) return NextResponse.json({ messages: [] });
  return NextResponse.json({ messages: await chatHistory(user.id, id) }, { headers: { "Cache-Control": "no-store" } });
}

const sse = (e: ChatEvent) => `data: ${JSON.stringify(e)}\n\n`;
const TERMINAL = new Set(["done", "stopped", "failed"]);

/**
 * Envoi d'une question : réponse en flux (SSE). L'abonnement n'est pas le traitement : si le
 * navigateur se ferme, la rédaction continue et son résultat est retrouvé dans le fil.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  if (isDemoMode() || !isAdminConfigured()) {
    return NextResponse.json({ error: "non_configure", message: "L'IA n'est pas configurée sur ce serveur." }, { status: 503 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const { id } = await ctx.params;
  const parsed = ChatSend.safeParse(await request.json().catch(() => null));
  if (!Id.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "requete_invalide", message: "Question vide ou trop longue." }, { status: 400 });

  let sent: Awaited<ReturnType<typeof sendChat>>;
  try {
    sent = await sendChat(user.id, id, parsed.data, request.headers.get("x-trace-id"));
  } catch (e) {
    if (e instanceof ReaderAIError && e.code === "credits") return billingResponse(await getT(), await getLang(), "credits", e.detail);
    if (e instanceof ReaderAIError) return NextResponse.json({ error: e.code, message: e.message }, { status: READER_AI_STATUS[e.code] });
    console.error("chat", (e as Error).name);
    return NextResponse.json({ error: "interne", message: "Une erreur est survenue. Réessayez." }, { status: 500 });
  }

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (e: ChatEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sse(e)));
        } catch {
          closed = true;
        }
        if (e.type === "done" || e.type === "stopped" || e.type === "error") {
          closed = true;
          unsubscribe();
          controller.close();
        }
      };
      if (sent.run) {
        unsubscribe = sent.run.events(push);
        return;
      }
      // Même message renvoyé : état enregistré, puis suivi jusqu'à la fin de la rédaction.
      const userId = user.id;
      void (async () => {
        let m: ChatMessageView | null = sent.resumed;
        push({ type: "accepted", user_id: sent.userId, message_id: sent.messageId, resumed: true });
        let shown = 0;
        const deadline = Date.now() + 80_000;
        while (m && !closed) {
          if (m.content.length !== shown) {
            push({ type: "text", from: 0, text: m.content });
            shown = m.content.length;
          }
          if (TERMINAL.has(m.status)) {
            push(m.status === "failed" ? { type: "error", code: m.error_code ?? "internal", message: "La réponse n'a pas pu être préparée. Réessayez." } : { type: m.status === "done" ? "done" : "stopped", message: m });
            return;
          }
          if (Date.now() > deadline) break;
          await new Promise((r) => setTimeout(r, 700));
          m = await chatMessage(userId, sent.messageId);
        }
        if (!closed) {
          closed = true;
          controller.close();
        }
      })();
    },
    cancel() {
      // Le navigateur ne suit plus : la rédaction continue sur le serveur.
      closed = true;
      unsubscribe();
    },
  });
  if (sent.run) after(() => sent.run!.done);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
