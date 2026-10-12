-- Prompt « Fluidité » § 9 et § 2.
--
-- 1. Session admin continue : la règle propre aux administrateurs (30 minutes d'inactivité,
--    12 heures au plus) est retirée ; ils suivent la règle commune (7 jours sans activité,
--    90 jours au plus). Déconnexion volontaire, révocation et suppression du compte restent
--    appliquées ; le rôle reste lu en base à chaque requête d'administration.
-- 2. Conversations du chat conservées : message de l'utilisateur et réponse (texte partiel
--    sauvegardé pendant la rédaction, état, sources vérifiées). Écriture par le serveur seul.
--
-- Réversible : voir « down » en fin de fichier.

create or replace function public.touch_session(p_session uuid, p_owner uuid, p_user_agent text, p_interactive boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  s record;
  idle constant interval := interval '7 days';
  absolute constant interval := interval '90 days';
begin
  select * into s from public.user_sessions where session_id = p_session for update;
  if not found then
    insert into public.user_sessions (session_id, owner_id, user_agent)
    values (p_session, p_owner, left(p_user_agent, 200));
    return 'ok';
  end if;
  if s.owner_id <> p_owner then return 'revoked'; end if;
  if s.revoked_at is not null then return case s.revoked_reason when 'logout' then 'revoked' else coalesce(s.revoked_reason, 'revoked') end; end if;
  if now() - s.last_activity_at > idle then
    update public.user_sessions set revoked_at = now(), revoked_reason = 'inactive' where session_id = p_session;
    return 'inactive';
  end if;
  if now() - s.created_at > absolute then
    update public.user_sessions set revoked_at = now(), revoked_reason = 'absolute' where session_id = p_session;
    return 'absolute';
  end if;
  -- Écriture limitée : au plus une mise à jour par minute et par appareil.
  if p_interactive and now() - s.last_activity_at > interval '1 minute' then
    update public.user_sessions set last_activity_at = now() where session_id = p_session;
  end if;
  return 'ok';
end $$;
revoke execute on function public.touch_session(uuid, uuid, text, boolean) from public, anon, authenticated;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  -- Identifiant choisi par l'appareil : un message renvoyé (réseau, double toucher) n'est créé qu'une fois.
  client_id text check (client_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  reply_to uuid references public.chat_messages(id) on delete cascade,
  section_id text check (char_length(section_id) <= 80),
  content text not null default '' check (char_length(content) <= 4000),
  status text not null default 'done' check (status in ('streaming', 'stopping', 'done', 'stopped', 'failed')),
  extras jsonb not null default '{}'::jsonb check (pg_column_size(extras) <= 16384),
  error_code text check (char_length(error_code) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, client_id)
);
create index if not exists chat_messages_report_idx on public.chat_messages (report_id, created_at desc);
create unique index if not exists chat_messages_reply_idx on public.chat_messages (reply_to) where reply_to is not null;
create trigger chat_messages_touch before update on public.chat_messages for each row execute function public.touch_updated_at();
alter table public.chat_messages enable row level security;
create policy "chat : lecture" on public.chat_messages for select using (owner_id = auth.uid());
revoke insert, update, delete on public.chat_messages from anon, authenticated;

-- down (manuel) :
--   drop table public.chat_messages;
--   rétablir touch_session de 20261011000000_device_sessions.sql (règle admin 30 min / 12 h).
