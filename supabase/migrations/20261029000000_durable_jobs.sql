-- Générations durables (prompt « Fluidité, reprise, UI, admin », § 1 et § 3).
--
-- 1. Relances automatiques bornées : état « retrying » avec date de prochaine tentative
--    (backoff exponentiel avec jitter calculé par le worker), au plus 3 relances par tâche.
-- 2. Jeton de bail (fencing) : chaque réservation incrémente lease_version ; un ancien worker
--    dont le bail a expiré ne peut plus écrire l'état de la tâche.
-- 3. Avancement réel (chapitres rédigés / prévus) lisible par le suivi, jamais estimé.
-- 4. Échec « reprenable » ou définitif, distingué sans nouvel état.
-- 5. Mesures de performance (durées seulement, aucun contenu) pour le suivi admin p50/p95.
--
-- Réversible : voir le bloc « down » en fin de fichier.

alter table public.jobs
  add column if not exists attempts smallint not null default 0 check (attempts between 0 and 10),
  add column if not exists next_run_at timestamptz,
  add column if not exists lease_version integer not null default 0,
  add column if not exists progress jsonb not null default '{}'::jsonb check (pg_column_size(progress) <= 4096),
  add column if not exists recoverable boolean;

alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check check (status in
  ('queued', 'running', 'retrying', 'awaiting_confirmation', 'succeeded', 'incomplete_check', 'failed', 'cancelled', 'uncertain'));

drop index if exists public.jobs_claim_idx;
create index jobs_claim_idx on public.jobs (status, created_at) where status in ('queued', 'running', 'retrying');

-- Transitions autorisées (miroir de src/lib/jobs/state.ts).
create or replace function public.check_job_transition()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = old.status then return new; end if;
  if not (
    (old.status = 'queued' and new.status in ('running', 'cancelled')) or
    (old.status = 'running' and new.status in
      ('awaiting_confirmation', 'succeeded', 'incomplete_check', 'failed', 'cancelled', 'uncertain', 'queued', 'retrying')) or
    (old.status = 'retrying' and new.status in ('running', 'queued', 'failed', 'cancelled')) or
    (old.status = 'awaiting_confirmation' and new.status in ('queued', 'cancelled')) or
    (old.status = 'uncertain' and new.status in ('queued', 'failed', 'cancelled')) or
    (old.status = 'failed' and new.status = 'queued')
  ) then
    raise exception 'Transition interdite : % -> %', old.status, new.status;
  end if;
  return new;
end $$;

-- Réservation atomique : file, bail expiré, ou relance arrivée à échéance. Le jeton de bail
-- est incrémenté à chaque réservation (fencing).
create or replace function public.claim_job(p_worker text, p_lease_seconds integer)
returns setof public.jobs language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.jobs j
     set status = 'running',
         lease_owner = p_worker,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         lease_version = j.lease_version + 1,
         heartbeat_at = now(),
         next_run_at = null,
         started_at = coalesce(j.started_at, now())
   where j.id = (
     select id from public.jobs
      where not cancel_requested
        and (status = 'queued'
          or (status = 'running' and lease_expires_at < now())
          or (status = 'retrying' and coalesce(next_run_at, now()) <= now()))
      order by coalesce(next_run_at, created_at)
      for update skip locked
      limit 1)
  returning j.*;
end $$;
revoke all on function public.claim_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_job(text, integer) to service_role;

-- Mesures : durées et contexte technique seulement (pas de contenu, pas d'adresse IP, pas de jeton).
create table if not exists public.perf_events (
  id bigint generated always as identity primary key,
  name text not null check (name ~ '^[a-z][a-z0-9_.]{1,59}$'),
  value_ms integer not null check (value_ms between 0 and 86400000),
  source text not null check (source in ('client', 'server')),
  route text check (char_length(route) <= 80),
  device text check (device in ('mobile', 'tablet', 'desktop')),
  network text check (char_length(network) <= 12),
  trace_id text check (char_length(trace_id) <= 40),
  job_id uuid,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists perf_events_name_idx on public.perf_events (name, created_at desc);
alter table public.perf_events enable row level security;
-- Aucune politique : lecture et écriture par le serveur (rôle de service) uniquement.
revoke all on public.perf_events from anon, authenticated;

-- Distribution par mesure (et par appareil) sur une période : p50, p95, volume, taux d'échec.
create or replace function public.perf_summary(p_days integer default 7)
returns table (name text, source text, device text, n bigint, p50 numeric, p95 numeric, fail_rate numeric)
language sql stable security definer set search_path = public as $$
  select e.name, e.source, coalesce(e.device, '—'),
         count(*),
         round(percentile_cont(0.5) within group (order by e.value_ms)::numeric),
         round(percentile_cont(0.95) within group (order by e.value_ms)::numeric),
         round(avg(case when e.ok then 0 else 1 end)::numeric, 3)
    from public.perf_events e
   where e.created_at > now() - make_interval(days => greatest(1, least(p_days, 90)))
   group by e.name, e.source, coalesce(e.device, '—')
   order by e.name, 3;
$$;
revoke all on function public.perf_summary(integer) from public, anon, authenticated;
grant execute on function public.perf_summary(integer) to service_role;

-- Purge : 90 jours de mesures au plus.
create or replace function public.purge_perf_events()
returns integer language sql security definer set search_path = public as $$
  with d as (delete from public.perf_events where created_at < now() - interval '90 days' returning 1)
  select count(*)::integer from d;
$$;
revoke all on function public.purge_perf_events() from public, anon, authenticated;
grant execute on function public.purge_perf_events() to service_role;

-- down (manuel) :
--   drop function public.purge_perf_events(); drop function public.perf_summary(integer); drop table public.perf_events;
--   update public.jobs set status = 'failed', recoverable = true where status = 'retrying';
--   rétablir check_job_transition, claim_job et jobs_status_check de 20261004000000_init.sql ;
--   alter table public.jobs drop column attempts, drop column next_run_at, drop column lease_version,
--     drop column progress, drop column recoverable;
