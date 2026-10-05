-- Comptes, crédits Limpid et paiements Chariow (spécification « Comptes, crédits, Chariow »).
-- Ajouts uniquement : aucune donnée existante n'est modifiée, sauf l'élargissement des valeurs
-- autorisées de profiles.plan et le nouveau réglage d'ouverture des inscriptions.
--
-- Principes :
--  * crédits rangés par lots datés (origine traçable, expiration) ; solde = somme des lots valides ;
--  * réserver → consommer ou libérer, une seule fois, sous verrou par compte ;
--  * journal append-only (credit_entries) ;
--  * un avantage par vente Chariow (payment_benefits), quels que soient les webhooks reçus ;
--  * toutes les écritures passent par des fonctions appelées avec la clé service_role.

-- ---------------------------------------------------------------- offres et inscriptions

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check
  check (plan in ('free', 'premium', 'essential', 'plus', 'pro'));

-- profiles.plan n'est plus l'autorité : l'offre active se lit dans subscriptions (dates).
-- Inscriptions publiques (offre gratuite) : fermées par défaut, ouvertes depuis l'administration.
alter table public.app_settings add column signup_open boolean not null default false;

-- Essais d'inscription limités comme les connexions.
alter table public.auth_attempts drop constraint if exists auth_attempts_kind_check;
alter table public.auth_attempts add constraint auth_attempts_kind_check check (kind in ('password', 'reset', 'signup'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r text;
begin
  select role into r from public.allowed_emails where email = lower(new.email);
  if r is null then
    -- Inscription publique : toujours un simple utilisateur, jamais un administrateur.
    if coalesce((select signup_open from public.app_settings where id), false) then
      r := 'user';
    else
      raise exception 'Adresse non autorisée pour cette alpha privée';
    end if;
  end if;
  insert into public.profiles (id, role) values (new.id, r);
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------- abonnements prépayés

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('essential', 'plus', 'pro')),
  period text not null check (period in ('monthly', 'yearly')),
  monthly_credits integer not null check (monthly_credits > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  sale_id text not null unique,
  created_at timestamptz not null default now()
);
create index subscriptions_owner_idx on public.subscriptions (owner_id, ends_at desc);

-- ---------------------------------------------------------------- lots, réservations, journal

create table public.credit_lots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  origin text not null check (origin in ('free_cycle', 'subscription', 'topup', 'compensation', 'migration')),
  origin_ref text not null,
  quantity integer not null check (quantity > 0),
  available integer not null check (available >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  consumed integer not null default 0 check (consumed >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (available + reserved + consumed = quantity),
  -- Une allocation de cycle, une recharge ou une compensation n'est créée qu'une fois.
  unique (owner_id, origin, origin_ref)
);
create index credit_lots_owner_idx on public.credit_lots (owner_id, expires_at);

create table public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (char_length(action) between 2 and 40),
  amount integer not null check (amount > 0),
  status text not null default 'reserved' check (status in ('reserved', 'consumed', 'released')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 120),
  job_id uuid references public.jobs(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  allocations jsonb not null,            -- [{ "lot": uuid, "n": entier }]
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (owner_id, idempotency_key)
);
create index credit_reservations_owner_idx on public.credit_reservations (owner_id, created_at desc);
create index credit_reservations_job_idx on public.credit_reservations (job_id) where job_id is not null;

create table public.credit_entries (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- Cascade (et non « set null ») : seule la suppression du compte efface lots et journal,
  -- sans jamais modifier une écriture existante.
  lot_id uuid references public.credit_lots(id) on delete cascade,
  reservation_id uuid references public.credit_reservations(id) on delete cascade,
  kind text not null check (kind in ('grant', 'reserve', 'consume', 'release', 'adjust')),
  amount integer not null,
  note text,
  created_at timestamptz not null default now()
);
create index credit_entries_owner_idx on public.credit_entries (owner_id, created_at desc);

-- Journal append-only : ni modification ni suppression (hors suppression du compte).
create or replace function public.credit_entries_append_only()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Journal des crédits : écriture compensatoire uniquement';
end $$;
create trigger credit_entries_no_update before update on public.credit_entries
  for each row execute function public.credit_entries_append_only();

-- ---------------------------------------------------------------- paiements

create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  order_ref text not null unique check (order_ref ~ '^lmp_[a-z0-9]{20,40}$'),
  product_code text not null,
  amount_xof integer not null check (amount_xof > 0),
  status text not null default 'created'
    check (status in ('created', 'pending', 'succeeded', 'failed', 'review', 'uncertain')),
  provider_product_id text not null,
  sale_id text unique,
  checkout_url text,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  unique (owner_id, idempotency_key)
);
create index payment_intents_owner_idx on public.payment_intents (owner_id, created_at desc);
create index payment_intents_pending_idx on public.payment_intents (status, created_at) where status in ('pending', 'uncertain');
create trigger payment_intents_touch before update on public.payment_intents
  for each row execute function public.touch_updated_at();

-- Un avantage par vente : la garantie d'unicité financière, quels que soient les webhooks.
create table public.payment_benefits (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'chariow',
  sale_id text not null,
  benefit text not null check (benefit in ('subscription', 'topup')),
  owner_id uuid not null references auth.users(id) on delete cascade,
  intent_id uuid not null references public.payment_intents(id) on delete cascade,
  amount_xof integer not null,
  created_at timestamptz not null default now(),
  unique (provider, sale_id, benefit)
);

-- Réception des webhooks : persistée avant l'accusé de réception ; aucun contenu client conservé.
create table public.webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'chariow',
  delivery_id text,
  event text not null,
  sale_id text,
  order_ref text,
  body_sha256 text not null check (body_sha256 ~ '^[a-f0-9]{64}$'),
  is_test boolean not null default false,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  attempts integer not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create unique index webhook_inbox_delivery_idx on public.webhook_inbox (provider, delivery_id) where delivery_id is not null;
create index webhook_inbox_status_idx on public.webhook_inbox (status, received_at);

-- ---------------------------------------------------------------- RLS : lecture par le propriétaire

alter table public.subscriptions enable row level security;
alter table public.credit_lots enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.credit_entries enable row level security;
alter table public.payment_intents enable row level security;
alter table public.payment_benefits enable row level security;
alter table public.webhook_inbox enable row level security;

create policy "abonnements : lecture" on public.subscriptions for select using (owner_id = auth.uid());
create policy "lots : lecture" on public.credit_lots for select using (owner_id = auth.uid());
create policy "réservations : lecture" on public.credit_reservations for select using (owner_id = auth.uid());
create policy "journal crédits : lecture" on public.credit_entries for select using (owner_id = auth.uid());
create policy "commandes : lecture" on public.payment_intents for select using (owner_id = auth.uid());
-- payment_benefits, webhook_inbox : aucun accès client.

-- ---------------------------------------------------------------- fonctions

-- Verrou transactionnel par compte : deux appareils ne dépensent jamais le même solde.
create or replace function public.lock_wallet(p_owner uuid)
returns void language sql set search_path = public as $$
  select pg_advisory_xact_lock(hashtextextended('wallet:' || p_owner::text, 0));
$$;

-- Attribution unique d'un lot (cycle, recharge, compensation). Renvoie l'identifiant du lot,
-- ou null s'il existait déjà (aucun double versement).
create or replace function public.grant_credits(
  p_owner uuid, p_origin text, p_ref text, p_qty integer, p_expires timestamptz, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  lot uuid;
begin
  if p_qty <= 0 then raise exception 'Quantité invalide'; end if;
  perform public.lock_wallet(p_owner);
  insert into public.credit_lots (owner_id, origin, origin_ref, quantity, available, expires_at)
  values (p_owner, p_origin, p_ref, p_qty, p_qty, p_expires)
  on conflict (owner_id, origin, origin_ref) do nothing
  returning id into lot;
  if lot is not null then
    insert into public.credit_entries (owner_id, lot_id, kind, amount, note) values (p_owner, lot, 'grant', p_qty, p_note);
  end if;
  return lot;
end $$;

-- Début du cycle mensuel courant à partir d'un ancrage (mois calendaires, sans dérive :
-- l'ancrage d'origine est toujours repris, le 31 devient le dernier jour des mois courts).
create or replace function public.cycle_bounds(p_anchor timestamptz, p_at timestamptz)
returns table (k integer, cycle_start timestamptz, cycle_end timestamptz)
language plpgsql stable set search_path = public as $$
declare
  n integer;
begin
  n := greatest(0, (extract(year from age(p_at, p_anchor)) * 12 + extract(month from age(p_at, p_anchor)))::integer);
  -- age() arrondit par défaut ; corrige d'un cran si nécessaire.
  while p_anchor + make_interval(months => n + 1) <= p_at loop n := n + 1; end loop;
  while n > 0 and p_anchor + make_interval(months => n) > p_at loop n := n - 1; end loop;
  return query select n, p_anchor + make_interval(months => n), p_anchor + make_interval(months => n + 1);
end $$;

-- Allocations dues (rattrapage idempotent, sans cumul des mois d'absence) :
--  * abonnement actif : allocation du cycle courant de l'abonnement ;
--  * sinon, compte vérifié : bonus gratuit du cycle courant (ancrage : création du compte).
create or replace function public.ensure_allocations(p_owner uuid, p_free_credits integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  s record;
  c record;
  verified timestamptz;
  created timestamptz;
begin
  select * into s from public.subscriptions
   where owner_id = p_owner and starts_at <= now() and ends_at > now()
   order by starts_at limit 1;
  if found then
    select * into c from public.cycle_bounds(s.starts_at, now());
    perform public.grant_credits(p_owner, 'subscription', s.id::text || ':' || c.k, s.monthly_credits,
      least(c.cycle_end, s.ends_at), 'allocation ' || s.plan);
    return;
  end if;
  select email_confirmed_at, u.created_at into verified, created from auth.users u where u.id = p_owner;
  if verified is null or p_free_credits <= 0 then return; end if;
  select * into c from public.cycle_bounds(created, now());
  perform public.grant_credits(p_owner, 'free_cycle', to_char(c.cycle_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'),
    p_free_credits, c.cycle_end, 'bonus gratuit');
end $$;

-- Réservation : lots valides, ceux qui expirent le plus tôt d'abord (allocations avant
-- recharges à échéance égale). Idempotente par (compte, clé) ; refusée si la même clé porte
-- une autre demande. Lève « credits_insuffisants » sans rien modifier.
create or replace function public.reserve_credits(
  p_owner uuid, p_amount integer, p_action text, p_key text, p_job uuid default null, p_report uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  existing record;
  need integer := p_amount;
  take integer;
  l record;
  allocs jsonb := '[]'::jsonb;
  res uuid;
  total integer;
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

-- Livraison : la réservation devient une consommation, une seule fois. Une réservation
-- engagée avant l'expiration de son lot est honorée après.
create or replace function public.settle_reservation(p_reservation uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  r record;
  a jsonb;
begin
  select * into r from public.credit_reservations where id = p_reservation;
  if not found then return false; end if;
  perform public.lock_wallet(r.owner_id);
  select * into r from public.credit_reservations where id = p_reservation for update;
  if r.status <> 'reserved' then return false; end if;
  for a in select * from jsonb_array_elements(r.allocations) loop
    update public.credit_lots set reserved = reserved - (a->>'n')::int, consumed = consumed + (a->>'n')::int
     where id = (a->>'lot')::uuid;
  end loop;
  update public.credit_reservations set status = 'consumed', settled_at = now() where id = p_reservation;
  insert into public.credit_entries (owner_id, reservation_id, kind, amount, note) values (r.owner_id, r.id, 'consume', 0, r.action);
  return true;
end $$;

-- Échec ou annulation : les crédits retournent dans leurs lots d'origine, à leur échéance
-- d'origine, une seule fois.
create or replace function public.release_reservation(p_reservation uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  r record;
  a jsonb;
begin
  select * into r from public.credit_reservations where id = p_reservation;
  if not found then return false; end if;
  perform public.lock_wallet(r.owner_id);
  select * into r from public.credit_reservations where id = p_reservation for update;
  if r.status <> 'reserved' then return false; end if;
  for a in select * from jsonb_array_elements(r.allocations) loop
    update public.credit_lots set reserved = reserved - (a->>'n')::int, available = available + (a->>'n')::int
     where id = (a->>'lot')::uuid;
  end loop;
  update public.credit_reservations set status = 'released', settled_at = now() where id = p_reservation;
  insert into public.credit_entries (owner_id, reservation_id, kind, amount, note) values (r.owner_id, r.id, 'release', r.amount, r.action);
  return true;
end $$;

-- Attribution d'un achat vérifié, en une transaction : unicité de l'avantage, commande
-- marquée payée, abonnement (à la suite de l'accès déjà payé) ou recharge (12 mois).
create or replace function public.fulfill_purchase(
  p_intent uuid, p_sale text, p_benefit text, p_plan text, p_period text, p_monthly integer, p_topup integer)
returns text language plpgsql security definer set search_path = public as $$
declare
  i record;
  start_at timestamptz;
  sub uuid;
begin
  select * into i from public.payment_intents where id = p_intent for update;
  if not found then raise exception 'Commande inconnue'; end if;
  perform public.lock_wallet(i.owner_id);
  insert into public.payment_benefits (sale_id, benefit, owner_id, intent_id, amount_xof)
  values (p_sale, p_benefit, i.owner_id, i.id, i.amount_xof)
  on conflict (provider, sale_id, benefit) do nothing;
  if not found then
    return 'deja_attribue';
  end if;
  update public.payment_intents set status = 'succeeded', sale_id = coalesce(sale_id, p_sale), fulfilled_at = now(), review_reason = null
   where id = i.id;
  if p_benefit = 'subscription' then
    -- Un renouvellement anticipé ou un changement d'offre prend effet à la fin de l'accès payé.
    select greatest(now(), coalesce(max(ends_at), now())) into start_at from public.subscriptions where owner_id = i.owner_id;
    insert into public.subscriptions (owner_id, plan, period, monthly_credits, starts_at, ends_at, sale_id)
    values (i.owner_id, p_plan, p_period, p_monthly, start_at,
            start_at + make_interval(months => case p_period when 'yearly' then 12 else 1 end), p_sale)
    returning id into sub;
  else
    perform public.grant_credits(i.owner_id, 'topup', p_sale, p_topup, now() + interval '12 months', 'recharge');
  end if;
  insert into public.audit_log (actor_id, action, target_kind, target_id, meta)
  values (i.owner_id, 'billing.fulfilled', 'order', i.order_ref, jsonb_build_object('product', i.product_code, 'benefit', p_benefit));
  return 'attribue';
end $$;

revoke execute on function public.lock_wallet(uuid) from public, anon, authenticated;
revoke execute on function public.grant_credits(uuid, text, text, integer, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.cycle_bounds(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.ensure_allocations(uuid, integer) from public, anon, authenticated;
revoke execute on function public.reserve_credits(uuid, integer, text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.settle_reservation(uuid) from public, anon, authenticated;
revoke execute on function public.release_reservation(uuid) from public, anon, authenticated;
revoke execute on function public.fulfill_purchase(uuid, text, text, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.credit_entries_append_only() from public, anon, authenticated;
