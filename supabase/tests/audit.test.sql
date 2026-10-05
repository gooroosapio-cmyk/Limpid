-- Recette SQL des corrections de l'audit (5 octobre 2026).
\set ON_ERROR_STOP 1
insert into public.allowed_emails (email, role) values ('g@test.fr', 'user'), ('boss@test.fr', 'admin');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a7', 'g@test.fr');

-- Réservation rendue puis clé réutilisée : nouvelle réservation, nouveau débit, plafonds comptés.
do $$
declare
  g uuid := '00000000-0000-0000-0000-0000000000a7';
  r1 uuid; r2 uuid; r3 uuid;
begin
  perform public.ensure_allocations(g, 80);
  r1 := public.reserve_credits_v2(g, 20, 'report_standard', 'report:abus-0001');
  if public.reserve_credits_v2(g, 20, 'report_standard', 'report:abus-0001') <> r1 then raise exception 'ECHEC : double envoi non idempotent'; end if;
  perform public.release_reservation(r1);
  if (select sum(available) from public.credit_lots where owner_id = g) <> 80 then raise exception 'ECHEC : restitution'; end if;
  r2 := public.reserve_credits_v2(g, 20, 'report_standard', 'report:abus-0001');
  if r2 = r1 then raise exception 'ECHEC : réservation rendue réutilisée (rapport gratuit)'; end if;
  if (select sum(available) from public.credit_lots where owner_id = g) <> 60 then raise exception 'ECHEC : pas de nouveau débit'; end if;
  if (select status from public.credit_reservations where id = r1) <> 'released' then raise exception 'ECHEC : trace de l''ancienne réservation perdue'; end if;
  -- Consommée puis clé réutilisée : également un nouveau débit.
  perform public.settle_reservation(r2);
  r3 := public.reserve_credits_v2(g, 20, 'report_standard', 'report:abus-0001');
  if r3 = r2 or (select sum(available) from public.credit_lots where owner_id = g) <> 40 then raise exception 'ECHEC : consommation réutilisée'; end if;
end $$;

-- Refus d'un achat de la boutique et limitation des liens magiques : valeurs admises.
insert into public.store_purchases (sale_id, product_code, amount_xof, email, status) values ('sale_rej', 'topup_70', 1000, 'x@test.fr', 'rejected');
insert into public.auth_attempts (key_hash, kind) values (repeat('a', 64), 'magic');

-- Déconnexion d'un appareil : la session Supabase est supprimée, seulement pour son titulaire.
insert into auth.sessions (id, user_id) values ('20000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000a7');
do $$ begin
  perform public.revoke_auth_session('20000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000d1');
  if not exists (select 1 from auth.sessions where id = '20000000-0000-0000-0000-0000000000a7') then raise exception 'ECHEC : session d''un autre supprimée'; end if;
  perform public.revoke_auth_session('20000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000a7');
  if exists (select 1 from auth.sessions where id = '20000000-0000-0000-0000-0000000000a7') then raise exception 'ECHEC : session non supprimée'; end if;
end $$;

-- Administrateur inscrit sans confirmation : simple utilisateur jusqu'à la confirmation.
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000b9', 'boss@test.fr', null);
do $$ begin
  if (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000b9') <> 'user' then raise exception 'ECHEC : admin avant confirmation'; end if;
  if public.unconfirmed_user_by_email('BOSS@test.fr') is distinct from '00000000-0000-0000-0000-0000000000b9' then raise exception 'ECHEC : compte non confirmé non repéré'; end if;
  update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000b9';
  if (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000b9') <> 'admin' then raise exception 'ECHEC : admin non promu après confirmation'; end if;
  if public.unconfirmed_user_by_email('boss@test.fr') is not null then raise exception 'ECHEC : compte confirmé repéré'; end if;
end $$;

set role authenticated;
do $$ begin
  perform public.revoke_auth_session(gen_random_uuid(), gen_random_uuid());
  raise exception 'ECHEC : révocation appelable par un client';
exception when insufficient_privilege then null;
end $$;
reset role;
\echo 'AUDIT OK'
