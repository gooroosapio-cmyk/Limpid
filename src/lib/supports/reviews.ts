/**
 * Révisions personnelles des flashcards (§ 7, 8, 12) : événements d'autoévaluation
 * idempotents (clé client), correction d'une note accidentelle (l'événement est remplacé, puis
 * l'état est recalculé par rejeu), sessions reprenables. Aucun appel IA, aucun crédit.
 * Écriture par le serveur pour l'utilisateur authentifié ; lecture sous RLS.
 */
import "server-only";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { FlashcardBank } from "./flashcards";
import { RATINGS, replay, SCHEDULE_VERSION, type CardState, type Rating } from "./schedule";

const key = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/);
const cardId = z.string().regex(/^fc_[a-z0-9]{6,40}$/);

export const RateRequest = z.strictObject({
  card_id: cardId,
  card_version: z.number().int().min(1).max(10_000),
  rating: z.enum(RATINGS),
  idempotency_key: key,
  session_id: z.string().uuid().nullable().optional(),
  /** Correction immédiate : clé de l'événement à remplacer (même carte). */
  replaces: key.nullable().optional(),
  /** Horodatage de l'appareil (envoi différé hors connexion) ; borné par le serveur. */
  occurred_at: z.string().datetime().optional(),
});
export type RateRequest = z.infer<typeof RateRequest>;

export const SessionRequest = z.strictObject({
  session_id: z.string().uuid().nullable().optional(),
  queue: z.array(cardId).max(600),
  position: z.number().int().min(0).max(2_000),
  revealed_card_id: cardId.nullable(),
  status: z.enum(["active", "done", "abandoned"]),
});

export class ReviewError extends Error {
  constructor(public readonly code: "not_found" | "unknown_card" | "storage") {
    super(code);
  }
}

/** Banque publiée du cours (la plus récente) : seules ses cartes peuvent être notées. */
async function bankOf(userId: string, reportId: string): Promise<FlashcardBank> {
  const db = adminClient();
  const { data: report } = await db.from("reports").select("id").eq("id", reportId).eq("owner_id", userId).is("deleted_at", null).maybeSingle();
  if (!report) throw new ReviewError("not_found");
  const { data } = await db.from("support_artifacts").select("body").eq("report_id", reportId).eq("type", "flashcards").order("published_at", { ascending: false }).limit(1).maybeSingle();
  const bank = FlashcardBank.safeParse(data?.body);
  if (!bank.success) throw new ReviewError("not_found");
  return bank.data;
}

/** Enregistre une note (une seule fois par clé) et renvoie l'état recalculé de la carte. */
export async function rateCard(userId: string, reportId: string, input: RateRequest): Promise<CardState> {
  const bank = await bankOf(userId, reportId);
  if (!bank.cards.some((c) => c.id === input.card_id)) throw new ReviewError("unknown_card");
  const db = adminClient();
  const now = Date.now();
  // Horodatage de l'appareil accepté s'il est plausible (au plus 7 jours de retard, jamais futur).
  const at = input.occurred_at && Date.parse(input.occurred_at) <= now && now - Date.parse(input.occurred_at) < 7 * 24 * 3600_000 ? input.occurred_at : new Date(now).toISOString();
  const ins = await db
    .from("flashcard_events")
    .insert({
      owner_id: userId,
      report_id: reportId,
      session_id: input.session_id ?? null,
      card_id: input.card_id,
      card_version: input.card_version,
      rating: input.rating,
      idempotency_key: input.idempotency_key,
      occurred_at: at,
    })
    .select("id")
    .maybeSingle();
  // Double toucher ou renvoi : l'événement existe déjà (clé unique), rien n'est compté deux fois.
  if (ins.error && ins.error.code !== "23505") throw new ReviewError("storage");
  const eventId =
    ins.data?.id ??
    (await db.from("flashcard_events").select("id").eq("owner_id", userId).eq("idempotency_key", input.idempotency_key).maybeSingle()).data?.id ??
    null;
  // Correction : appliquée même si l'envoi précédent s'est interrompu juste après l'insertion.
  if (input.replaces && eventId && input.replaces !== input.idempotency_key) {
    await db
      .from("flashcard_events")
      .update({ superseded_by: eventId })
      .eq("owner_id", userId)
      .eq("report_id", reportId)
      .eq("card_id", input.card_id)
      .eq("idempotency_key", input.replaces)
      .is("superseded_by", null);
  }
  return recompute(userId, reportId, input.card_id);
}

/** État d'une carte rejoué depuis ses événements effectifs (règle versionnée). */
async function recompute(userId: string, reportId: string, card: string): Promise<CardState> {
  const db = adminClient();
  const { data: events } = await db
    .from("flashcard_events")
    .select("rating, occurred_at, card_version")
    .eq("owner_id", userId)
    .eq("report_id", reportId)
    .eq("card_id", card)
    .is("superseded_by", null)
    .order("occurred_at")
    .limit(500);
  const list = (events ?? []) as { rating: Rating; occurred_at: string; card_version: number }[];
  const state = replay(list);
  const version = list.length ? Math.max(...list.map((e) => e.card_version)) : 1;
  const up = await db.from("flashcard_progress").upsert(
    {
      owner_id: userId,
      report_id: reportId,
      card_id: card,
      card_version: version,
      schedule_version: SCHEDULE_VERSION,
      last_rating: state.last_rating,
      step: state.step,
      interval_days: state.interval_days,
      reviews: state.reviews,
      lapses: state.lapses,
      next_review_at: state.next_review_at,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,report_id,card_id" },
  );
  if (up.error) throw new ReviewError("storage");
  return state;
}

/** Crée ou met à jour la session (file, position, carte révélée) : reprise sans perte. */
export async function saveSession(userId: string, reportId: string, input: z.infer<typeof SessionRequest>): Promise<{ sessionId: string }> {
  const bank = await bankOf(userId, reportId);
  const known = new Set(bank.cards.map((c) => c.id));
  const queue = input.queue.filter((id) => known.has(id));
  const db = adminClient();
  const row = {
    queue,
    position: Math.min(input.position, queue.length),
    revealed_card_id: input.revealed_card_id && known.has(input.revealed_card_id) ? input.revealed_card_id : null,
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  if (input.session_id) {
    const { data } = await db.from("flashcard_sessions").update(row).eq("id", input.session_id).eq("owner_id", userId).eq("report_id", reportId).select("id").maybeSingle();
    if (data) return { sessionId: data.id as string };
  }
  // Une seule session active par cours : la précédente est close.
  await db.from("flashcard_sessions").update({ status: "abandoned" }).eq("owner_id", userId).eq("report_id", reportId).eq("status", "active");
  const { data, error } = await db.from("flashcard_sessions").insert({ owner_id: userId, report_id: reportId, ...row }).select("id").single();
  if (error || !data) throw new ReviewError("storage");
  return { sessionId: data.id as string };
}
