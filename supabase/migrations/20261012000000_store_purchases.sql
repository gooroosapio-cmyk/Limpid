-- Achats faits directement sur la boutique Chariow (sans passer par Limpid) : conservés,
-- puis rattachés au compte dont l'adresse VÉRIFIÉE correspond à celle du paiement.
-- Aucune suppression : ajout de table, de colonne et de fonctions.

alter table public.payment_intents add column if not exists origin text not null default 'checkout'
  constraint payment_intents_origin_check check (origin in ('checkout', 'store'));

create table if not exists public.store_purchases (
  sale_id text primary key check (char_length(sale_id) between 3 and 100),
  product_code text not null,
  amount_xof integer not null check (amount_xof > 0),
  -- Adresse du paiement, en minuscules : seule clé de rattachement.
  email text not null check (email = lower(email) and char_length(email) between 3 and 320),
  status text not null default 'unclaimed' check (status in ('unclaimed', 'claimed', 'review')),
  owner_id uuid references auth.users(id) on delete set null,
  intent_id uuid references public.payment_intents(id) on delete set null,
  review_reason text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index if not exists store_purchases_email_idx on public.store_purchases (email) where status = 'unclaimed';
alter table public.store_purchases enable row level security;
-- Aucune politique et aucun droit client : lecture et écriture réservées au serveur (clé de service).
revoke all on public.store_purchases from anon, authenticated;

-- Compte dont l'adresse confirmée est exactement p_email (sinon null : rien n'est rattaché).
create or replace function public.user_by_verified_email(p_email text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users
   where lower(email) = lower(p_email) and email_confirmed_at is not null and deleted_at is null
   limit 1
$$;
revoke execute on function public.user_by_verified_email(text) from public, anon, authenticated;

-- Réserve atomiquement les achats non rattachés d'une adresse pour un compte (un seul gagnant).
create or replace function public.claim_store_purchases(p_owner uuid, p_email text)
returns setof public.store_purchases language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.store_purchases
     set status = 'claimed', owner_id = p_owner, claimed_at = now()
   where status = 'unclaimed' and email = lower(p_email)
  returning *;
end $$;
revoke execute on function public.claim_store_purchases(uuid, text) from public, anon, authenticated;
