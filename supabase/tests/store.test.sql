-- Recette SQL : achats faits sur la boutique, rattachés par adresse vérifiée.
\set ON_ERROR_STOP 1
insert into public.allowed_emails (email, role) values ('buyer@test.fr', 'user'), ('pending@test.fr', 'user');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'Buyer@Test.fr');
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000d2', 'pending@test.fr', null);

do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000000d1';
  n int;
begin
  if public.user_by_verified_email('buyer@test.fr') is distinct from u then raise exception 'ECHEC : adresse vérifiée non trouvée'; end if;
  if public.user_by_verified_email('pending@test.fr') is not null then raise exception 'ECHEC : adresse non vérifiée acceptée'; end if;
  if public.user_by_verified_email('autre@test.fr') is not null then raise exception 'ECHEC : adresse inconnue acceptée'; end if;

  insert into public.store_purchases (sale_id, product_code, amount_xof, email) values ('sale_s1', 'topup_70', 1000, 'buyer@test.fr');
  select count(*) into n from public.claim_store_purchases(u, 'BUYER@test.fr');
  if n <> 1 then raise exception 'ECHEC : achat non réservé (%)', n; end if;
  -- Second appel (double clic, autre onglet) : rien de plus.
  select count(*) into n from public.claim_store_purchases(u, 'buyer@test.fr');
  if n <> 0 then raise exception 'ECHEC : achat réservé deux fois'; end if;
  begin
    insert into public.store_purchases (sale_id, product_code, amount_xof, email) values ('sale_s2', 'topup_70', 1000, 'Maj@Test.fr');
    raise exception 'ECHEC : adresse non normalisée acceptée';
  exception when check_violation then null;
  end;
end $$;

-- Clients : ni lecture de la table, ni appel des fonctions.
set role authenticated;
do $$
begin
  -- Les recettes précédentes redonnent les droits par défaut de Supabase : la RLS sans politique reste la barrière.
  if exists (select 1 from public.store_purchases) then raise exception 'ECHEC : table lisible par un client'; end if;
exception when insufficient_privilege then null;
end $$;
do $$
begin
  perform public.user_by_verified_email('buyer@test.fr');
  raise exception 'ECHEC : fonction appelable par un client';
exception when insufficient_privilege then null;
end $$;
reset role;
\echo 'BOUTIQUE OK'
