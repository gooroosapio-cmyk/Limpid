-- Corrections issues de l'audit du 5 octobre 2026. Aucune donnée supprimée.

-- 1. Réservation de crédits : seule une réservation encore « en cours » est réutilisée
--    (double envoi). Une réservation rendue ou consommée garde sa trace sous une clé
--    archivée, et la demande crée une nouvelle réservation (nouveau débit, plafonds revus).
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
revoke execute on function public.reserve_credits_v2(uuid, integer, text, text, uuid, uuid, integer, integer) from public, anon, authenticated;

-- 2. Achats de la boutique : refus explicite possible par l'administrateur.
alter table public.store_purchases drop constraint if exists store_purchases_status_check;
alter table public.store_purchases add constraint store_purchases_status_check
  check (status in ('unclaimed', 'claimed', 'review', 'rejected'));

-- 3. Liens magiques limités comme les autres envois d'email.
alter table public.auth_attempts drop constraint if exists auth_attempts_kind_check;
alter table public.auth_attempts add constraint auth_attempts_kind_check
  check (kind in ('password', 'reset', 'signup', 'magic'));

-- 4. Déconnexion d'un appareil : la session Supabase elle-même est supprimée (son jeton de
--    rafraîchissement ne vaut plus rien), pas seulement marquée.
create or replace function public.revoke_auth_session(p_session uuid, p_owner uuid)
returns void language sql security definer set search_path = public, auth as $$
  delete from auth.sessions where id = p_session and user_id = p_owner
$$;
revoke execute on function public.revoke_auth_session(uuid, uuid) from public, anon, authenticated;

-- 5. Compte créé mais jamais confirmé (personne n'a prouvé posséder l'adresse) : repéré pour
--    être effacé avant l'envoi d'un lien, afin qu'un mot de passe choisi par un tiers ne
--    survive pas à la confirmation par le vrai titulaire.
create or replace function public.unconfirmed_user_by_email(p_email text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users
   where lower(email) = lower(p_email) and email_confirmed_at is null and deleted_at is null
   limit 1
$$;
revoke execute on function public.unconfirmed_user_by_email(text) from public, anon, authenticated;

-- 6. Rôle administrateur seulement une fois l'adresse confirmée.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r text;
begin
  select role into r from public.allowed_emails where email = lower(new.email);
  if r is null then
    if coalesce((select signup_open from public.app_settings where id), false) then
      r := 'user';
    else
      raise exception 'Adresse non autorisée pour cette alpha privée';
    end if;
  end if;
  if r = 'admin' and new.email_confirmed_at is null then
    r := 'user';
  end if;
  insert into public.profiles (id, role) values (new.id, r);
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.promote_confirmed_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null
     and exists (select 1 from public.allowed_emails where email = lower(new.email) and role = 'admin') then
    update public.profiles set role = 'admin' where id = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.promote_confirmed_user() from public, anon, authenticated;
create or replace trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.promote_confirmed_user();

-- 7. Règles d'accès : auth.uid() évalué une fois par requête, pas par ligne.
alter policy "réponses : lecture" on public.comprehension_answers using (owner_id = (select auth.uid()));
alter policy "journal crédits : lecture" on public.credit_entries using (owner_id = (select auth.uid()));
alter policy "lots : lecture" on public.credit_lots using (owner_id = (select auth.uid()));
alter policy "réservations : lecture" on public.credit_reservations using (owner_id = (select auth.uid()));
alter policy "suppressions : lecture" on public.deletion_requests using (owner_id = (select auth.uid()));
alter policy "preuves : lecture" on public.evidence using ((owner_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM sources s WHERE ((s.id = evidence.source_id) AND (s.deleted_at IS NULL)))));
alter policy "exports : lecture" on public.exports using (owner_id = (select auth.uid()));
alter policy "dossiers : lecture" on public.folders using (owner_id = (select auth.uid()));
alter policy "jobs : lecture" on public.jobs using (owner_id = (select auth.uid()));
alter policy "commandes : lecture" on public.payment_intents using (owner_id = (select auth.uid()));
alter policy "profil personnel" on public.profiles using (id = (select auth.uid()));
alter policy "tentatives : lecture" on public.quiz_attempts using (owner_id = (select auth.uid()));
alter policy "préférences : lecture" on public.reader_preferences using (owner_id = (select auth.uid()));
alter policy "préférences : création" on public.reader_preferences with check (owner_id = (select auth.uid()));
alter policy "préférences : modification" on public.reader_preferences using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy "préférences : effacement" on public.reader_preferences using (owner_id = (select auth.uid()));
alter policy "progression : lecture" on public.report_progress using (owner_id = (select auth.uid()));
alter policy "tests : lecture" on public.report_quizzes using (owner_id = (select auth.uid()));
alter policy "sources du rapport : lecture" on public.report_sources using (owner_id = (select auth.uid()));
alter policy "versions : lecture" on public.report_versions using ((owner_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM reports r WHERE ((r.id = report_versions.report_id) AND (r.deleted_at IS NULL)))));
alter policy "rapports : lecture" on public.reports using ((owner_id = (select auth.uid())) AND (deleted_at IS NULL));
alter policy "segments : lecture" on public.source_segments using ((owner_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM sources s WHERE ((s.id = source_segments.source_id) AND (s.deleted_at IS NULL)))));
alter policy "sources : lecture" on public.sources using ((owner_id = (select auth.uid())) AND (deleted_at IS NULL));
alter policy "abonnements : lecture" on public.subscriptions using (owner_id = (select auth.uid()));
alter policy "consommation : lecture" on public.usage_ledger using (owner_id = (select auth.uid()));
alter policy "sessions : lecture" on public.user_sessions using (owner_id = (select auth.uid()));
alter policy "visuels : lecture" on public.visual_assets using ((owner_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM reports r WHERE ((r.id = visual_assets.report_id) AND (r.deleted_at IS NULL)))));

-- 8. Index des clés étrangères (suppressions en cascade, jointures).
create index if not exists comprehension_answers_owner_id_fk_idx on public.comprehension_answers (owner_id);
create index if not exists comprehension_answers_report_version_id_fk_idx on public.comprehension_answers (report_version_id);
create index if not exists credit_entries_lot_id_fk_idx on public.credit_entries (lot_id);
create index if not exists credit_entries_reservation_id_fk_idx on public.credit_entries (reservation_id);
create index if not exists credit_reservations_report_id_fk_idx on public.credit_reservations (report_id);
create index if not exists deletion_requests_owner_id_fk_idx on public.deletion_requests (owner_id);
create index if not exists evidence_owner_id_fk_idx on public.evidence (owner_id);
create index if not exists evidence_segment_id_fk_idx on public.evidence (source_id, segment_id);
create index if not exists exports_owner_id_fk_idx on public.exports (owner_id);
create index if not exists jobs_report_id_fk_idx on public.jobs (report_id);
create index if not exists jobs_source_id_fk_idx on public.jobs (source_id);
create index if not exists knowledge_objects_owner_id_fk_idx on public.knowledge_objects (owner_id);
create index if not exists payment_benefits_intent_id_fk_idx on public.payment_benefits (intent_id);
create index if not exists payment_benefits_owner_id_fk_idx on public.payment_benefits (owner_id);
create index if not exists quiz_attempts_report_version_id_fk_idx on public.quiz_attempts (report_version_id);
create index if not exists report_progress_report_id_fk_idx on public.report_progress (report_id);
create index if not exists report_versions_knowledge_id_fk_idx on public.report_versions (knowledge_id);
create index if not exists report_versions_owner_id_fk_idx on public.report_versions (owner_id);
create index if not exists report_versions_parent_version_id_fk_idx on public.report_versions (parent_version_id);
create index if not exists reports_current_version_id_fk_idx on public.reports (current_version_id);
create index if not exists reports_folder_id_fk_idx on public.reports (folder_id);
create index if not exists reports_source_id_fk_idx on public.reports (source_id);
create index if not exists store_purchases_intent_id_fk_idx on public.store_purchases (intent_id);
create index if not exists store_purchases_owner_id_fk_idx on public.store_purchases (owner_id);
create index if not exists webhook_inbox_retry_idx on public.webhook_inbox (status, received_at) where is_test = false;
create index if not exists store_purchases_stuck_idx on public.store_purchases (claimed_at) where status = 'claimed' and intent_id is null;
