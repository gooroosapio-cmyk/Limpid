-- Plafonds de rapports par jour et par semaine (spécification V2, § 15), vérifiés dans la même
-- transaction que la réservation des crédits : deux appareils ne prennent jamais la dernière
-- place. Jour : calendrier UTC ; semaine : du lundi 00:00 UTC au lundi suivant.
-- Une « unité rapport » : création, nouvelle version complète ; les échecs (réservations
-- rendues) ne comptent pas.

drop function if exists public.reserve_credits(uuid, integer, text, text, uuid, uuid);

create or replace function public.report_units(p_owner uuid, p_since timestamptz)
returns integer language sql stable set search_path = public as $$
  select count(*)::integer from public.credit_reservations
   where owner_id = p_owner
     and action in ('report_short', 'report_standard', 'report_long', 'report_version')
     and status <> 'released'
     and created_at >= p_since;
$$;

create or replace function public.reserve_credits(
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
  select * into existing from public.credit_reservations where owner_id = p_owner and idempotency_key = p_key;
  if found then
    if existing.amount <> p_amount or existing.action <> p_action then
      raise exception 'cle_reutilisee' using errcode = 'P0001';
    end if;
    return existing.id;
  end if;
  -- Plafonds de rythme (unités rapport seulement), indépendants du solde.
  if p_action in ('report_short', 'report_standard', 'report_long', 'report_version') then
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

revoke execute on function public.report_units(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.reserve_credits(uuid, integer, text, text, uuid, uuid, integer, integer) from public, anon, authenticated;
