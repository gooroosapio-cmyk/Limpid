-- Sessions d'appareil (spécification V2, § 5) : une session Supabase (claim session_id du
-- jeton) = un appareil. Expiration après 7 jours sans activité interactive, plafond absolu
-- de 90 jours ; administrateurs : 30 minutes et 12 heures. L'échéance est vérifiée AVANT de
-- prolonger : une session expirée ne se ressuscite pas en envoyant une requête.

create table public.user_sessions (
  session_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason in ('inactive', 'absolute', 'revoked', 'logout')),
  user_agent text check (char_length(user_agent) <= 200)
);
create index user_sessions_owner_idx on public.user_sessions (owner_id, last_activity_at desc);

alter table public.user_sessions enable row level security;
create policy "sessions : lecture" on public.user_sessions for select using (owner_id = auth.uid());

-- Contrôle d'une requête : 'ok', ou la raison du refus ('inactive', 'inactive_admin', 'absolute', 'revoked').
-- p_interactive : action ou consultation de premier plan (jamais un rafraîchissement de jeton,
-- un sondage en arrière-plan, un cron ou un webhook).
create or replace function public.touch_session(p_session uuid, p_owner uuid, p_user_agent text, p_interactive boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  s record;
  admin boolean;
  idle interval;
  absolute interval;
begin
  select exists (select 1 from public.profiles where id = p_owner and role = 'admin') into admin;
  idle := case when admin then interval '30 minutes' else interval '7 days' end;
  absolute := case when admin then interval '12 hours' else interval '90 days' end;
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
    -- Message distinct pour l'administration (30 minutes, pas 7 jours).
    return case when admin then 'inactive_admin' else 'inactive' end;
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
