/**
 * Chat progressif et durable (prompt « Fluidité », § 2) : le serveur enregistre la question,
 * crée la réponse, puis la rédige en flux. Le texte partiel est sauvegardé pendant la
 * rédaction ; la fermeture du navigateur n'annule rien (la rédaction finit sur le serveur) ;
 * seul « Arrêter » interrompt, en gardant le texte déjà écrit.
 */
import "server-only";
import { z } from "zod";
import { getProvider } from "@/lib/engine";
import { ProviderError } from "@/lib/engine/provider";
import { recordPerf } from "@/lib/perf/server";
import { askContext, askModel, verifyCitations } from "@/lib/reports/ask";
import { providerFailure, ReaderAIError, recordReaderUsage, withCredits } from "@/lib/reports/ai-call";
import { adminClient } from "@/lib/supabase/admin";
import { partialString } from "./partial";

export const ChatSend = z.strictObject({
  question: z.string().trim().min(2).max(500),
  section_id: z.string().regex(/^[a-z]{1,6}_[A-Za-z0-9_-]{1,64}$/).nullable().optional(),
  client_id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
});
export type ChatSend = z.infer<typeof ChatSend>;

export interface ChatExtras {
  in_document?: boolean;
  citations?: { location: string; quote: string }[];
  beyond?: string | null;
  followups?: string[];
}

export interface ChatMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "streaming" | "stopping" | "done" | "stopped" | "failed";
  extras: ChatExtras;
  error_code: string | null;
  reply_to: string | null;
  client_id: string | null;
  created_at: string;
}

/** Événements transmis au navigateur : `text` remplace le texte à partir de `from`. */
export type ChatEvent =
  | { type: "accepted"; user_id: string; message_id: string; resumed: boolean }
  | { type: "text"; from: number; text: string }
  | { type: "done"; message: ChatMessageView }
  | { type: "stopped"; message: ChatMessageView }
  | { type: "error"; code: string; message: string };

const COLUMNS = "id, role, content, status, extras, error_code, reply_to, client_id, created_at";
const PERSIST_MS = 800;
const EMIT_MS = 50;

/** Fil d'un Limpid : 30 derniers messages, du plus ancien au plus récent. */
export async function chatHistory(userId: string, reportId: string): Promise<ChatMessageView[]> {
  const { data } = await adminClient()
    .from("chat_messages")
    .select(COLUMNS)
    .eq("owner_id", userId)
    .eq("report_id", reportId)
    .order("created_at", { ascending: false })
    .limit(30);
  return ((data ?? []) as ChatMessageView[]).reverse();
}

export async function chatMessage(userId: string, messageId: string): Promise<ChatMessageView | null> {
  const { data } = await adminClient().from("chat_messages").select(COLUMNS).eq("owner_id", userId).eq("id", messageId).maybeSingle();
  return (data as ChatMessageView | null) ?? null;
}

/** « Arrêter » : demande explicite, lue par la rédaction à sa prochaine sauvegarde. */
export async function stopChat(userId: string, messageId: string): Promise<boolean> {
  const { data } = await adminClient()
    .from("chat_messages")
    .update({ status: "stopping" })
    .eq("owner_id", userId)
    .eq("id", messageId)
    .eq("status", "streaming")
    .select("id");
  return !!data?.length;
}

/** Historique transmis au modèle : 4 derniers échanges terminés, bornés. */
async function recentPairs(userId: string, reportId: string) {
  const msgs = (await chatHistory(userId, reportId)).filter((m) => m.status === "done" || m.status === "stopped");
  const pairs: { q: string; a: string }[] = [];
  for (const a of msgs.filter((m) => m.role === "assistant")) {
    const q = msgs.find((m) => m.id === a.reply_to);
    if (q && a.content) pairs.push({ q: q.content.slice(0, 500), a: a.content.slice(0, 1_500) });
  }
  return pairs.slice(-4);
}

export interface ChatRun {
  events: (listener: (e: ChatEvent) => void) => () => void;
  /** Fin de la rédaction (succès, arrêt ou échec) : à garder vivante après la réponse HTTP. */
  done: Promise<void>;
}

/**
 * Envoie une question. Un même `client_id` renvoyé (réseau coupé, double toucher) ne crée
 * rien : la réponse existante est reprise (`resumed`). Les erreurs avant acceptation sont levées.
 */
export async function sendChat(userId: string, reportId: string, input: ChatSend, traceId: string | null): Promise<{ resumed: ChatMessageView | null; run: ChatRun | null; userId: string; messageId: string }> {
  const db = adminClient();
  const t0 = Date.now();
  const { data: prior } = await db.from("chat_messages").select("id").eq("owner_id", userId).eq("client_id", input.client_id).maybeSingle();
  if (prior) {
    const { data: reply } = await db.from("chat_messages").select(COLUMNS).eq("reply_to", prior.id).maybeSingle();
    if (!reply) throw new ReaderAIError("invalid", "Message déjà reçu.");
    return { resumed: reply as ChatMessageView, run: null, userId: prior.id as string, messageId: (reply as ChatMessageView).id };
  }

  const ctx = await askContext(userId, reportId, input);
  const history = await recentPairs(userId, reportId);
  const { data: q, error: qErr } = await db
    .from("chat_messages")
    .insert({ owner_id: userId, report_id: reportId, role: "user", client_id: input.client_id, section_id: input.section_id ?? null, content: input.question })
    .select("id")
    .single();
  if (qErr?.code === "23505") return sendChat(userId, reportId, input, traceId);
  if (qErr || !q) throw new ReaderAIError("invalid", "La question n'a pas pu être enregistrée.");
  const { data: a, error: aErr } = await db
    .from("chat_messages")
    .insert({ owner_id: userId, report_id: reportId, role: "assistant", reply_to: q.id, status: "streaming" })
    .select("id")
    .single();
  if (aErr || !a) throw new ReaderAIError("invalid", "La réponse n'a pas pu être préparée.");
  const messageId = a.id as string;
  await recordPerf("chat.accepted", Date.now() - t0, { traceId });

  const listeners = new Set<(e: ChatEvent) => void>();
  const backlog: ChatEvent[] = [];
  const emit = (e: ChatEvent) => {
    backlog.push(e);
    for (const l of listeners) l(e);
  };

  const controller = new AbortController();
  let answer = "";
  let sent = "";
  let firstAt: number | null = null;
  let stopRequested = false;
  let lastPersist = 0;
  let emitTimer: ReturnType<typeof setTimeout> | null = null;
  let persisting: Promise<unknown> = Promise.resolve();

  const flushText = () => {
    emitTimer = null;
    if (answer === sent) return;
    // Texte remplacé (modèle de secours) : on repart du début ; sinon seulement la suite.
    const from = answer.startsWith(sent) ? sent.length : 0;
    emit({ type: "text", from, text: answer.slice(from) });
    sent = answer;
  };
  const persist = () => {
    lastPersist = Date.now();
    const content = answer.slice(0, 4_000);
    persisting = persisting.then(async () => {
      const { data } = await db.from("chat_messages").update({ content }).eq("id", messageId).in("status", ["streaming", "stopping"]).select("status").maybeSingle();
      if (data?.status === "stopping" && !stopRequested) {
        stopRequested = true;
        controller.abort();
      }
    });
  };

  const onText = (raw: string) => {
    const next = partialString(raw, "answer");
    if (next === null || next === answer) return;
    answer = next;
    if (firstAt === null && answer.trim()) {
      firstAt = Date.now();
      void recordPerf("chat.first_text", firstAt - t0, { traceId });
    }
    emitTimer ??= setTimeout(flushText, EMIT_MS);
    if (Date.now() - lastPersist > PERSIST_MS) persist();
  };

  // Arrêt demandé avant le premier texte : vérifié aussi sans attendre une sauvegarde.
  const stopWatch = setInterval(() => {
    if (Date.now() - lastPersist > PERSIST_MS) persist();
  }, PERSIST_MS);

  const finish = async (status: "done" | "stopped" | "failed", extras: ChatExtras, errorCode: string | null) => {
    clearInterval(stopWatch);
    if (emitTimer) clearTimeout(emitTimer);
    flushText();
    await persisting.catch(() => undefined);
    const { data } = await db
      .from("chat_messages")
      .update({ content: answer.slice(0, 4_000), status, extras, error_code: errorCode })
      .eq("id", messageId)
      .select(COLUMNS)
      .single();
    return data as ChatMessageView;
  };

  const done = (async () => {
    try {
      const out = await withCredits(userId, "ask", reportId, async () => {
        try {
          const res = await askModel(getProvider(), { question: input.question, section_id: input.section_id ?? null, history }, ctx.explanation, ctx.passages, AbortSignal.any([controller.signal, AbortSignal.timeout(65_000)]), onText);
          await recordReaderUsage(userId, "ask", res.usage);
          answer = res.value.answer;
          const segs = new Map(ctx.passages.map((s) => [s.id, s]));
          return {
            stopped: false,
            extras: { in_document: res.value.in_document, citations: verifyCitations(res.value.citations, segs), beyond: res.value.beyond || null, followups: res.value.followups } satisfies ChatExtras,
          };
        } catch (e) {
          // Arrêt demandé : le texte déjà écrit est conservé ; il est compté s'il existe.
          if (stopRequested && answer.trim()) {
            if (e instanceof ProviderError && e.usage) await recordReaderUsage(userId, "ask", e.usage);
            return { stopped: true, extras: {} as ChatExtras };
          }
          if (stopRequested) throw new ReaderAIError("invalid", "stopped");
          return providerFailure(userId, "ask", e, "La réponse n'a pas pu être préparée. Réessayez.");
        }
      });
      const message = await finish(out.stopped ? "stopped" : "done", out.extras, null);
      emit({ type: out.stopped ? "stopped" : "done", message });
      await recordPerf("chat.server_total", Date.now() - t0, { traceId });
    } catch (e) {
      if (stopRequested) {
        const message = await finish("stopped", {}, null);
        emit({ type: "stopped", message });
        return;
      }
      const code = e instanceof ReaderAIError ? e.code : "internal";
      const msg = e instanceof ReaderAIError ? e.message : "La réponse n'a pas pu être préparée. Réessayez.";
      await finish("failed", {}, code).catch(() => undefined);
      emit({ type: "error", code, message: msg });
      await recordPerf("chat.server_total", Date.now() - t0, { traceId, ok: false });
    }
  })();

  const run: ChatRun = {
    events(listener) {
      for (const e of backlog) listener(e);
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    done,
  };
  emit({ type: "accepted", user_id: q.id as string, message_id: messageId, resumed: false });
  return { resumed: null, run, userId: q.id as string, messageId };
}
