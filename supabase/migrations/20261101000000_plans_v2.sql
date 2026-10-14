-- Règles optimisées des forfaits (spécification du 14 octobre 2026, § 3, 5, 7).
--
-- 1. Offre Max ; Essentiel reste reconnu pour les abonnements déjà payés (plus vendu).
-- 2. Gratuit : bonus de bienvenue unique (80 crédits, 90 jours) pour un compte vérifié, financé
--    par un budget marketing mensuel réglable ; ensuite 20 crédits par cycle mensuel, sans cumul
--    ni empilement sur un bonus encore actif. Les comptes déjà servis par l'ancien bonus mensuel
--    sont considérés comme accueillis.
-- 3. Passage gratuit → payant : le premier cycle ne verse que le complément jusqu'à l'allocation
--    du forfait (le solde offert restant fait partie du solde initial).
-- 4. Nouveau prix continu d'un cours (action « report », montant variable) et limite de
--    nouvelles générations par période (cycle du forfait).
--
-- Réversible : voir « down » en fin de fichier.

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check check (plan in ('free', 'premium', 'essential', 'plus', 'pro', 'max'));
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check check (plan in ('essential', 'plus', 'pro', 'max'));

alter table public.credit_lots drop constraint if exists credit_lots_origin_check;
alter table public.credit_lots add constraint credit_lots_origin_check
  check (origin in ('free_cycle', 'welcome', 'free_monthly', 'subscription', 'topup', 'compensation', 'migration'));

alter table public.app_settings
  add column if not exists marketing_budget_xof integer not null default 50000 check (marketing_budget_xof between 0 and 100000000),
  add column if not exists welcome_cost_xof integer not null default 240 check (welcome_cost_xof between 1 and 100000);

-- Allocations dues (rattrapage idempotent) :
--  * abonnement actif : allocation du cycle ; premier cycle après le gratuit = complément ;
--  * sinon, compte vérifié : bonus de bienvenue (une fois, si le budget marketing du mois le
--    permet), puis 20 crédits par cycle une fois le bonus consommé ou expiré.
create or replace function public.ensure_allocations_v2(
  p_owner uuid, p_welcome integer, p_welcome_days integer, p_monthly integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  s record;
  c record;
  verified timestamptz;
  created timestamptz;
  amount integer;
  offered integer;
  budget integer;
  unit integer;
  spent integer;
  welcomed boolean;
begin
  select * into s from public.subscriptions
   where owner_id = p_owner and starts_at <= now() and ends_at > now()
   order by starts_at limit 1;
  if found then
    select * into c from public.cycle_bounds(s.starts_at, now());
    amount := s.monthly_credits;
    -- Premier cycle d'un abonnement qui ne prolonge pas un autre : complément seulement.
    if c.k = 0 and not exists (
      select 1 from public.subscriptions p
       where p.owner_id = p_owner and p.id <> s.id and p.starts_at < s.starts_at and p.ends_at >= s.starts_at - interval '1 day'
    ) then
      select coalesce(sum(available), 0) into offered from public.credit_lots
       where owner_id = p_owner and origin in ('welcome', 'free_monthly', 'free_cycle') and expires_at > now();
      amount := greatest(0, s.monthly_credits - offered);
    end if;
    if amount > 0 then
      perform public.grant_credits(p_owner, 'subscription', s.id::text || ':' || c.k, amount,
        least(c.cycle_end, s.ends_at), 'allocation ' || s.plan);
    end if;
    return;
  end if;

  select email_confirmed_at, u.created_at into verified, created from auth.users u where u.id = p_owner;
  if verified is null then return; end if;

  welcomed := exists (select 1 from public.credit_lots where owner_id = p_owner and origin in ('welcome', 'free_cycle'));
  if not welcomed and p_welcome > 0 then
    -- Budget marketing du mois : réservé avant l'octroi ; au-delà, le bonus est différé.
    select marketing_budget_xof, welcome_cost_xof into budget, unit from public.app_settings where id = true;
    perform pg_advisory_xact_lock(hashtextextended('welcome-budget', 0));
    select count(*) * coalesce(unit, 240) into spent from public.credit_lots
     where origin = 'welcome' and created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
    if spent + coalesce(unit, 240) <= coalesce(budget, 0) then
      perform public.grant_credits(p_owner, 'welcome', 'welcome', p_welcome, now() + make_interval(days => p_welcome_days), 'bonus de bienvenue');
      return;
    end if;
  end if;

  -- Bonus encore actif : pas d'empilement avec l'allocation mensuelle.
  if exists (select 1 from public.credit_lots where owner_id = p_owner and origin in ('welcome', 'free_cycle') and available > 0 and expires_at > now()) then
    return;
  end if;
  if p_monthly <= 0 then return; end if;
  select * into c from public.cycle_bounds(created, now());
  perform public.grant_credits(p_owner, 'free_monthly', to_char(c.cycle_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'),
    p_monthly, c.cycle_end, 'allocation gratuite');
end $$;
revoke all on function public.ensure_allocations_v2(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.ensure_allocations_v2(uuid, integer, integer, integer) to service_role;

-- Nouvelles générations de cours depuis le début de la période (prix continu « report »).
create or replace function public.course_units(p_owner uuid, p_since timestamptz)
returns integer language sql stable set search_path = public as $$
  select count(*)::integer from public.credit_reservations
   where owner_id = p_owner
     and action in ('report', 'report_short', 'report_standard', 'report_long', 'report_xl')
     and status <> 'released'
     and created_at >= p_since;
$$;

-- Réservation atomique (comme v2) avec limite de générations par période pour « report ».
create or replace function public.reserve_credits_v3(
  p_owner uuid, p_amount integer, p_action text, p_key text, p_job uuid default null, p_report uuid default null,
  p_period_start timestamptz default null, p_period_limit integer default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  existing record;
  need integer := p_amount;
  take integer;
  l record;
  allocs jsonb := '[]'::jsonb;
  res uuid;
  total integer;
  used integer;
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
  if p_action = 'report' and p_period_limit is not null and p_period_start is not null then
    used := public.course_units(p_owner, p_period_start);
    if used >= p_period_limit then
      raise exception 'periode_atteinte:%:%', used, p_period_limit using errcode = 'P0001';
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
revoke all on function public.reserve_credits_v3(uuid, integer, text, text, uuid, uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.reserve_credits_v3(uuid, integer, text, text, uuid, uuid, timestamptz, integer) to service_role;

-- down (manuel) :
--   drop function public.reserve_credits_v3(uuid, integer, text, text, uuid, uuid, timestamptz, integer);
--   drop function public.course_units(uuid, timestamptz);
--   drop function public.ensure_allocations_v2(uuid, integer, integer, integer);
--   alter table public.app_settings drop column marketing_budget_xof, drop column welcome_cost_xof;
--   rétablir credit_lots_origin_check, subscriptions_plan_check et profiles_plan_check (20261009000000_credits_billing.sql)
--   après avoir converti les lots « welcome »/« free_monthly » et les abonnements « max ».
