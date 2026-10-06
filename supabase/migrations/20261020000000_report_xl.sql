-- Prix selon la source (V5) : palier « très long » (101 à 150 pages, 140 crédits).
-- Les deux fonctions qui reconnaissent une « unité rapport » comptent aussi report_xl.
-- Redéfinitions à l'identique, liste d'actions élargie ; aucune donnée modifiée.

create or replace function public.report_units(p_owner uuid, p_since timestamptz)
returns integer language sql stable set search_path = public as $$
  select count(*)::integer from public.credit_reservations
   where owner_id = p_owner
     and action in ('report_short', 'report_standard', 'report_long', 'report_xl', 'report_version')
     and status <> 'released'
     and created_at >= p_since;
$$;

create or replace function public.reserve_credits_v2(
  p_owner uuid, p_amount integer, p_action text, p_key text, p_job uuid default null, p_report uuid default null,
  p_day_limit integer default null, p_week_limit integer default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  existing record;
  need integer := p_amount;
  take integer;
  l record;
  allocs jsonb := '[]'::jsonb;
  res uuid;
  total integer;
  day_used integer;
  week_used integer;
  day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  week_start timestamptz := date_trunc('week', now() at time zone 'UTC') at time zone 'UTC';
begin
  if p_amount <= 0 then raise exception 'Montant invalide'; end if;
  perform public.lock_wallet(p_owner);
  select * into existing from public.credit_reservations where owner_id = p_owner and idempotency_key = p_key for update;
  if found then
    if existing.amount <> p_amount or existing.action <> p_action then
      raise exception 'cle_reutilisee' using errcode = 'P0001';
    end if;
    if existing.status = 'reserved' then
      return existing.id;
    end if;
    update public.credit_reservations
       set idempotency_key = left(p_key, 60) || ':archive:' || existing.id::text
     where id = existing.id;
  end if;
  if p_action in ('report_short', 'report_standard', 'report_long', 'report_xl', 'report_version') then
    day_used := public.report_units(p_owner, day_start);
    week_used := public.report_units(p_owner, week_start);
    if (p_day_limit is not null and day_used >= p_day_limit) or (p_week_limit is not null and week_used >= p_week_limit) then
      raise exception 'quota_atteint:%:%:%:%', day_used, coalesce(p_day_limit, -1), week_used, coalesce(p_week_limit, -1)
        using errcode = 'P0001';
    end if;
  end if;
  select coalesce(sum(available), 0) into total from public.credit_lots
   where owner_id = p_owner and expires_at > now() and available > 0;
  if total < p_amount then
    raise exception 'credits_insuffisants:%', total using errcode = 'P0001';
  end if;
  res := gen_random_uuid();
  for l in
    select id, available from public.credit_lots
     where owner_id = p_owner and expires_at > now() and available > 0
     order by expires_at, case origin when 'topup' then 1 else 0 end, created_at
     for update
  loop
    exit when need = 0;
    take := least(need, l.available);
    update public.credit_lots set available = available - take, reserved = reserved + take where id = l.id;
    allocs := allocs || jsonb_build_object('lot', l.id, 'n', take);
    need := need - take;
  end loop;
  insert into public.credit_reservations (id, owner_id, action, amount, idempotency_key, job_id, report_id, allocations)
  values (res, p_owner, p_action, p_amount, p_key, p_job, p_report, allocs);
  insert into public.credit_entries (owner_id, reservation_id, kind, amount, note) values (p_owner, res, 'reserve', -p_amount, p_action);
  return res;
end $$;

-- Moteur V5 : points de reprise par fragment de source et par chapitre (une tâche longue
-- s'étend sur plusieurs invocations sans refaire ni repayer le travail validé).
alter table public.generation_checkpoints drop constraint if exists generation_checkpoints_stage_check;
alter table public.generation_checkpoints add constraint generation_checkpoints_stage_check
  check (stage ~ '^(comprehension|explication|plan|frag_[0-9]{1,3}|chap_[0-9]{1,3})$');
