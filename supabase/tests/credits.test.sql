-- Recette SQL des crédits et paiements (spécification « Comptes, crédits, Chariow », § 22).
\set ON_ERROR_STOP 1

-- Comptes : C payant/gratuit, D pour l'isolation, E non vérifié.
insert into public.allowed_emails (email, role) values ('c@test.fr', 'user'), ('d@test.fr', 'user'), ('e@test.fr', 'user');
insert into auth.users (id, email, created_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'c@test.fr', now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000000d1', 'd@test.fr', now() - interval '3 days');
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000e1', 'e@test.fr', null);

-- Inscription publique : refusée tant qu'elle est fermée, puis simple utilisateur.
do $$ begin
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'public@test.fr');
  raise exception 'ECHEC : inscription publique acceptée alors qu''elle est fermée';
exception when others then
  if sqlerrm like 'ECHEC%' then raise; end if;
end $$;
update public.app_settings set signup_open = true;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'public@test.fr');
do $$ begin
  if (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000f1') <> 'user' then
    raise exception 'ECHEC : un inscrit public n''est pas simple utilisateur';
  end if;
end $$;
update public.app_settings set signup_open = false;

-- T02 : allocation gratuite du cycle versée une seule fois, même rejouée dix fois.
do $$ begin
  for i in 1..10 loop perform public.ensure_allocations('00000000-0000-0000-0000-0000000000c1', 80); end loop;
  if (select count(*) from public.credit_lots where owner_id = '00000000-0000-0000-0000-0000000000c1') <> 1
     or (select sum(available) from public.credit_lots where owner_id = '00000000-0000-0000-0000-0000000000c1') <> 80 then
    raise exception 'ECHEC : bonus gratuit versé plusieurs fois';
  end if;
end $$;

-- T03 : un compte non vérifié ne reçoit rien.
do $$ begin
  perform public.ensure_allocations('00000000-0000-0000-0000-0000000000e1', 80);
  if exists (select 1 from public.credit_lots where owner_id = '00000000-0000-0000-0000-0000000000e1') then
    raise exception 'ECHEC : crédits attribués à un compte non vérifié';
  end if;
end $$;

-- T09-T13 : réservation, idempotence, solde insuffisant, livraison et échec sans double effet.
do $$
declare
  r1 uuid; r1b uuid; r2 uuid; r3 uuid;
  c uuid := '00000000-0000-0000-0000-0000000000c1';
begin
  r1 := public.reserve_credits(c, 20, 'report_standard', 'key-report-0001');
  r1b := public.reserve_credits(c, 20, 'report_standard', 'key-report-0001');
  if r1 <> r1b then raise exception 'ECHEC : double clic = deux réservations'; end if;
  if (select sum(available) from public.credit_lots where owner_id = c) <> 60
     or (select sum(reserved) from public.credit_lots where owner_id = c) <> 20 then
    raise exception 'ECHEC : 80 -> 60 disponibles + 20 réservés attendu';
  end if;
  begin
    perform public.reserve_credits(c, 8, 'report_short', 'key-report-0001');
    raise exception 'ECHEC : clé réutilisée pour une autre demande';
  exception when others then
    if sqlerrm like 'ECHEC%' then raise; end if;
    if sqlerrm <> 'cle_reutilisee' then raise; end if;
  end;
  begin
    perform public.reserve_credits(c, 70, 'report_long', 'key-report-0002');
    raise exception 'ECHEC : réservation au-delà du solde';
  exception when others then
    if sqlerrm like 'ECHEC%' then raise; end if;
    if sqlerrm not like 'credits_insuffisants:60' then raise; end if;
  end;
  if exists (select 1 from public.credit_reservations where idempotency_key = 'key-report-0002') then
    raise exception 'ECHEC : réservation partielle laissée';
  end if;

  -- Livraison : 60 disponibles, 20 consommés ; rejouée : aucun effet.
  if not public.settle_reservation(r1) then raise exception 'ECHEC : livraison refusée'; end if;
  if public.settle_reservation(r1) or public.release_reservation(r1) then raise exception 'ECHEC : double solde'; end if;
  if (select sum(available) from public.credit_lots where owner_id = c) <> 60
     or (select sum(consumed) from public.credit_lots where owner_id = c) <> 20 then
    raise exception 'ECHEC : 60 disponibles après livraison attendu';
  end if;

  -- Échec : crédits rendus une seule fois.
  r2 := public.reserve_credits(c, 20, 'report_standard', 'key-report-0003');
  if not public.release_reservation(r2) then raise exception 'ECHEC : libération refusée'; end if;
  if public.release_reservation(r2) then raise exception 'ECHEC : double restitution'; end if;
  if (select sum(available) from public.credit_lots where owner_id = c) <> 60 then
    raise exception 'ECHEC : solde après échec incorrect';
  end if;

  -- T17 : une réservation engagée reste honorée après l'expiration de son lot.
  r3 := public.reserve_credits(c, 8, 'report_short', 'key-report-0004');
  update public.credit_lots set expires_at = now() - interval '1 second' where owner_id = c;
  if not public.settle_reservation(r3) then raise exception 'ECHEC : réservation engagée perdue à l''expiration'; end if;
  begin
    perform public.reserve_credits(c, 1, 'ask', 'key-ask-000001');
    raise exception 'ECHEC : crédits expirés dépensés';
  exception when others then
    if sqlerrm like 'ECHEC%' then raise; end if;
  end;
end $$;

-- T27 : cycles du 31 janvier et du 29 février sans dérive.
do $$
declare b record;
begin
  select * into b from public.cycle_bounds('2027-01-31 10:00+00', '2027-03-15 00:00+00');
  if b.k <> 1 or b.cycle_start <> '2027-02-28 10:00+00' or b.cycle_end <> '2027-03-31 10:00+00' then
    raise exception 'ECHEC : ancrage du 31 janvier (%, %, %)', b.k, b.cycle_start, b.cycle_end;
  end if;
  select * into b from public.cycle_bounds('2028-02-29 00:00+00', '2029-03-01 00:00+00');
  if b.k <> 12 or b.cycle_start <> '2029-02-28 00:00+00' then
    raise exception 'ECHEC : ancrage du 29 février (%, %)', b.k, b.cycle_start;
  end if;
end $$;

-- T24, T25, T28, T36, T38 : achats attribués une seule fois ; l'annuel ne verse qu'une allocation
-- mensuelle ; le renouvellement anticipé prend effet à la fin de l'accès ; pas de bonus gratuit
-- pendant l'abonnement.
insert into public.payment_intents (id, owner_id, order_ref, product_code, amount_xof, provider_product_id, idempotency_key, status)
values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'lmp_aaaaaaaaaaaaaaaaaaaa', 'plus_yearly', 59000, 'prd_x', 'buy-0000001', 'pending'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d1', 'lmp_bbbbbbbbbbbbbbbbbbbb', 'plus_monthly', 5900, 'prd_y', 'buy-0000002', 'pending'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000d1', 'lmp_cccccccccccccccccccc', 'topup_500', 5000, 'prd_z', 'buy-0000003', 'pending');
do $$
declare
  d uuid := '00000000-0000-0000-0000-0000000000d1';
  s record;
begin
  if public.fulfill_purchase('30000000-0000-0000-0000-000000000001', 'sal_1', 'subscription', 'plus', 'yearly', 600, null) <> 'attribue' then
    raise exception 'ECHEC : achat annuel non attribué';
  end if;
  for i in 1..10 loop
    if public.fulfill_purchase('30000000-0000-0000-0000-000000000001', 'sal_1', 'subscription', 'plus', 'yearly', 600, null) <> 'deja_attribue' then
      raise exception 'ECHEC : vente attribuée deux fois';
    end if;
  end loop;
  perform public.ensure_allocations(d, 80);
  perform public.ensure_allocations(d, 80);
  if (select sum(available) from public.credit_lots where owner_id = d) <> 600
     or exists (select 1 from public.credit_lots where owner_id = d and origin = 'free_cycle') then
    raise exception 'ECHEC : annuel = 600 par mois, sans bonus gratuit';
  end if;
  select * into s from public.subscriptions where sale_id = 'sal_1';
  if s.ends_at <> s.starts_at + interval '12 months' then raise exception 'ECHEC : durée annuelle'; end if;

  -- Renouvellement anticipé : commence à la fin des douze mois, aucune allocation immédiate.
  perform public.fulfill_purchase('30000000-0000-0000-0000-000000000002', 'sal_2', 'subscription', 'plus', 'monthly', 600, null);
  if (select starts_at from public.subscriptions where sale_id = 'sal_2') <> s.ends_at then
    raise exception 'ECHEC : renouvellement anticipé mal placé';
  end if;
  perform public.ensure_allocations(d, 80);
  if (select sum(available) from public.credit_lots where owner_id = d) <> 600 then
    raise exception 'ECHEC : mensualité supplémentaire immédiate';
  end if;

  -- Recharge : 500 crédits, 12 mois.
  perform public.fulfill_purchase('30000000-0000-0000-0000-000000000003', 'sal_3', 'topup', null, null, null, 500);
  perform public.fulfill_purchase('30000000-0000-0000-0000-000000000003', 'sal_3', 'topup', null, null, null, 500);
  if (select count(*) from public.credit_lots where owner_id = d and origin = 'topup') <> 1
     or (select available from public.credit_lots where owner_id = d and origin = 'topup') <> 500 then
    raise exception 'ECHEC : recharge attribuée deux fois';
  end if;
  if (select status from public.payment_intents where id = '30000000-0000-0000-0000-000000000003') <> 'succeeded' then
    raise exception 'ECHEC : commande non marquée payée';
  end if;
end $$;

-- Journal append-only.
do $$ begin
  update public.credit_entries set amount = 999 where owner_id = '00000000-0000-0000-0000-0000000000d1';
  raise exception 'ECHEC : journal des crédits modifiable';
exception when others then
  if sqlerrm like 'ECHEC%' then raise; end if;
end $$;

-- T06 : isolation entre comptes (lecture seule pour le propriétaire, aucune écriture client).
grant select, insert, update, delete on all tables in schema public to authenticated;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  if exists (select 1 from public.credit_lots where owner_id <> '00000000-0000-0000-0000-0000000000c1')
     or exists (select 1 from public.payment_intents)
     or exists (select 1 from public.subscriptions)
     or exists (select 1 from public.payment_benefits)
     or exists (select 1 from public.webhook_inbox) then
    raise exception 'ECHEC : C voit des données de D';
  end if;
  if not exists (select 1 from public.credit_lots) then raise exception 'ECHEC : C ne voit pas ses lots'; end if;
end $$;
do $$ begin
  insert into public.credit_lots (owner_id, origin, origin_ref, quantity, available, expires_at)
  values ('00000000-0000-0000-0000-0000000000c1', 'compensation', 'triche', 1000, 1000, now() + interval '1 year');
  raise exception 'ECHEC : un client crée ses propres crédits';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.credit_lots set available = 1000;
  if exists (select 1 from public.credit_lots where available = 1000) then raise exception 'ECHEC : solde modifiable par le client'; end if;
end $$;
reset role;

-- Fonctions de crédit : jamais appelables par un client.
do $$ begin
  if has_function_privilege('authenticated', 'public.reserve_credits(uuid, integer, text, text, uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.grant_credits(uuid, text, text, integer, timestamptz, text)', 'execute')
     or has_function_privilege('anon', 'public.fulfill_purchase(uuid, text, text, text, text, integer, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.ensure_allocations(uuid, integer)', 'execute') then
    raise exception 'ECHEC : fonction de crédit appelable par un client';
  end if;
end $$;

-- Suppression du compte : lots, réservations et journal effacés sans erreur.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000d1';
do $$ begin
  if exists (select 1 from public.credit_entries where owner_id = '00000000-0000-0000-0000-0000000000d1') then
    raise exception 'ECHEC : journal conservé après suppression du compte';
  end if;
end $$;

select 'RECETTE CRÉDITS : OK' as resultat;
