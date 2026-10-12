-- Recette SQL : relances bornées, jeton de bail, mesures réservées au serveur.
\set ON_ERROR_STOP 1
reset role;
insert into public.allowed_emails (email, role) values ('jobs@test.fr', 'user') on conflict do nothing;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f7', 'jobs@test.fr');

do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000000f7';
  j uuid := gen_random_uuid();
  v1 int; v2 int; r public.jobs;
begin
  update public.jobs set status = 'cancelled' where status in ('queued', 'running', 'retrying', 'awaiting_confirmation', 'uncertain');
  insert into public.jobs (id, owner_id, kind, idempotency_key) values (j, u, 'generate_report', 'jobs-test-0001');
  select * into r from public.claim_job('w1', 60);
  if r.id is distinct from j or r.lease_version <> 1 then raise exception 'ECHEC : réservation (%)', r.lease_version; end if;
  v1 := r.lease_version;
  -- Relance programmée dans le futur : pas encore réservable.
  update public.jobs set status = 'retrying', attempts = 1, next_run_at = now() + interval '1 hour', lease_owner = null where id = j;
  if exists (select 1 from public.claim_job('w2', 60)) then raise exception 'ECHEC : relance réservée avant échéance'; end if;
  -- Échéance atteinte : réservée, jeton incrémenté, échéance effacée.
  update public.jobs set next_run_at = now() - interval '1 second' where id = j;
  select * into r from public.claim_job('w2', 60);
  if r.id is distinct from j or r.lease_version <= v1 or r.next_run_at is not null or r.attempts <> 1 then raise exception 'ECHEC : relance non reprise'; end if;
  v2 := r.lease_version;
  -- Fencing : l'ancien worker (jeton v1) n'écrit plus rien.
  update public.jobs set status = 'succeeded' where id = j and lease_version = v1;
  if (select status from public.jobs where id = j) <> 'running' then raise exception 'ECHEC : ancien worker a écrit'; end if;
  update public.jobs set status = 'failed', recoverable = true where id = j and lease_version = v2;
  -- Reprise utilisateur : failed -> queued autorisé ; retrying -> succeeded interdit.
  update public.jobs set status = 'queued', attempts = 0 where id = j;
  begin
    update public.jobs set status = 'retrying' where id = j;
    update public.jobs set status = 'succeeded' where id = j;
    raise exception 'ECHEC : transition interdite acceptée';
  exception when raise_exception then
    if sqlerrm like 'ECHEC%' then raise; end if;
  end;
end $$;

insert into public.perf_events (name, value_ms, source, device) values ('nav.internal', 120, 'client', 'mobile'), ('nav.internal', 180, 'client', 'mobile'), ('job.create', 400, 'server', null);
do $$
begin
  if (select n from public.perf_summary(7) where name = 'nav.internal') <> 2 then raise exception 'ECHEC : synthèse des mesures'; end if;
  begin
    insert into public.perf_events (name, value_ms, source) values ('Bad Name', 1, 'client');
    raise exception 'ECHEC : nom de mesure invalide accepté';
  exception when check_violation then null;
  end;
end $$;

set role authenticated;
do $$
begin
  perform public.perf_summary(7);
  raise exception 'ECHEC : synthèse appelable par un client';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  if exists (select 1 from public.perf_events) then raise exception 'ECHEC : mesures lisibles par un client'; end if;
exception when insufficient_privilege then null;
end $$;
reset role;
select 'JOBS OK';

-- Conversations : lecture par le propriétaire seulement, écriture par le serveur seul.
reset role;
insert into public.reports (id, owner_id, title) values ('00000000-0000-0000-0000-0000000000f8', '00000000-0000-0000-0000-0000000000f7', 'Chat');
insert into public.chat_messages (owner_id, report_id, role, client_id, content) values ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000f8', 'user', 'client-0001', 'Question ?');
do $$
begin
  insert into public.chat_messages (owner_id, report_id, role, client_id, content) values ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000f8', 'user', 'client-0001', 'Doublon');
  raise exception 'ECHEC : message renvoyé créé deux fois';
exception when unique_violation then null;
end $$;
set role authenticated;
do $$
begin
  insert into public.chat_messages (owner_id, report_id, role, content) values ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000f8', 'user', 'x');
  raise exception 'ECHEC : message écrit par un client';
exception when insufficient_privilege then null;
end $$;
reset role;
select 'CHAT OK';
