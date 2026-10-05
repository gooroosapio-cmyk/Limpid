-- Recette SQL : isolation entre comptes, transitions, idempotence, écritures tardives.
\set ON_ERROR_STOP 1
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

insert into public.allowed_emails (email, role) values ('a@test.fr', 'admin'), ('b@test.fr', 'user');
insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'a@test.fr');
insert into auth.users values ('00000000-0000-0000-0000-00000000000b', 'B@test.fr');

-- Inscription fermée
do $$ begin
  insert into auth.users values ('00000000-0000-0000-0000-00000000000c', 'intrus@test.fr');
  raise exception 'ECHEC : adresse hors liste blanche acceptée';
exception when others then
  if sqlerrm like 'ECHEC%' then raise; end if;
end $$;

-- Données créées par le serveur (service_role) pour A et B
insert into public.sources (id, owner_id, kind, title) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'paste', 'Source A'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'paste', 'Source B');
insert into public.reports (id, owner_id, source_id, title) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Rapport A'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'Rapport B');
insert into public.visual_assets (owner_id, report_id, provider, kind, query, storage_path) values
  ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'commons', 'photo', 'water cycle', 'a/x.jpg'),
  ('00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'commons', 'photo', 'water cycle', 'b/x.jpg');

-- Utilisateur A
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if (select count(*) from public.reports) <> 1 then raise exception 'ECHEC : A voit % rapports', (select count(*) from public.reports); end if;
  if exists (select 1 from public.sources where title = 'Source B') then raise exception 'ECHEC : A voit la source de B'; end if;
  if (select count(*) from public.visual_assets) <> 1 then raise exception 'ECHEC : A voit % illustrations', (select count(*) from public.visual_assets); end if;
end $$;
-- A ne peut pas écrire un rapport (écritures via serveur uniquement)
do $$ begin
  insert into public.reports (owner_id, title) values ('00000000-0000-0000-0000-00000000000b', 'usurpation');
  raise exception 'ECHEC : insertion client acceptée';
exception when insufficient_privilege then null;
end $$;
-- Préférences : le propriétaire est forcé, même si le client en fournit un autre
insert into public.reader_preferences (owner_id, goal) values ('00000000-0000-0000-0000-00000000000b', 'reviser');
reset role;
do $$ begin
  if (select owner_id from public.reader_preferences) <> '00000000-0000-0000-0000-00000000000a' then
    raise exception 'ECHEC : propriétaire fourni par le client accepté';
  end if;
end $$;

-- Idempotence : deux créations avec la même clé
insert into public.jobs (owner_id, report_id, kind, idempotency_key)
  values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'generate_report', 'cle-unique-123');
do $$ begin
  insert into public.jobs (owner_id, report_id, kind, idempotency_key)
    values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'generate_report', 'cle-unique-123');
  raise exception 'ECHEC : double lancement accepté';
exception when unique_violation then null;
end $$;

-- Réservation par un worker, puis transition interdite
do $$ declare j public.jobs; begin
  select * into j from public.claim_job('worker-1', 60);
  if j.status <> 'running' then raise exception 'ECHEC : claim'; end if;
  update public.jobs set status = 'succeeded' where id = j.id;
  begin
    update public.jobs set status = 'running' where id = j.id;
    raise exception 'ECHEC : sortie d''un état terminal';
  exception when raise_exception then
    if sqlerrm like 'ECHEC%' then raise; end if;
  end;
end $$;

-- Une seule réservation : un second worker ne reçoit pas la même tâche ; un bail expiré est repris.
insert into public.jobs (id, owner_id, report_id, kind, idempotency_key)
  values ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'generate_report', 'cle-reservation-1');
do $$ declare a public.jobs; b public.jobs; c public.jobs; begin
  select * into a from public.claim_job('worker-a', 60);
  select * into b from public.claim_job('worker-b', 60);
  if a.id is distinct from '30000000-0000-0000-0000-00000000000a' then raise exception 'ECHEC : réservation'; end if;
  if b.id is not null then raise exception 'ECHEC : tâche réservée deux fois'; end if;
  update public.jobs set lease_expires_at = now() - interval '1 second' where id = a.id;
  select * into c from public.claim_job('worker-c', 60);
  if c.id is distinct from a.id or c.lease_owner <> 'worker-c' then raise exception 'ECHEC : bail expiré non repris'; end if;
end $$;

-- Consommation : une même tentative n'est jamais débitée deux fois.
insert into public.usage_ledger (owner_id, job_id, stage, attempt, provider, model, status, reserved_cents)
  values ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'explication', 0, 'gemini', 'm', 'settled', 2);
do $$ begin
  insert into public.usage_ledger (owner_id, job_id, stage, attempt, provider, model, status, reserved_cents)
    values ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'explication', 0, 'gemini', 'm', 'settled', 2);
  raise exception 'ECHEC : double débit accepté';
exception when unique_violation then null;
end $$;

-- Un client ne peut pas appeler claim_job
set role authenticated;
do $$ begin
  perform public.claim_job('x', 60);
  raise exception 'ECHEC : claim_job accessible au client';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Suppression : marqueur puis écriture tardive refusée
update public.reports set deleted_at = now() where id = '20000000-0000-0000-0000-00000000000a';
do $$ begin
  insert into public.visual_assets (owner_id, report_id, provider, kind, query, storage_path)
    values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'commons', 'photo', 'late', 'a/y.jpg');
  raise exception 'ECHEC : illustration tardive acceptée';
exception when raise_exception then
  if sqlerrm like 'ECHEC%' then raise; end if;
end $$;
do $$ begin
  insert into public.report_versions (report_id, owner_id, version_number, level, goal, template_id, target_pages, provider)
    values ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 1, 'grand_public', 'comprendre', 'comprendre_sujet', 5, 'demo');
  raise exception 'ECHEC : écriture tardive acceptée';
exception when raise_exception then
  if sqlerrm like 'ECHEC%' then raise; end if;
end $$;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if exists (select 1 from public.reports) then raise exception 'ECHEC : rapport supprimé encore visible'; end if;
  if exists (select 1 from public.visual_assets) then raise exception 'ECHEC : illustration d''un rapport supprimé visible'; end if;
end $$;
reset role;

-- Tests « Me tester » : lecture par le propriétaire seulement, écriture par le serveur seulement
insert into public.sources (id, owner_id, kind, title) values
  ('10000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'paste', 'Source A2');
insert into public.reports (id, owner_id, source_id, title) values
  ('20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a2', 'Rapport A2');
insert into public.report_versions (id, report_id, owner_id, version_number, level, goal, template_id, target_pages, provider) values
  ('30000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 1, 'grand_public', 'comprendre', 'comprendre_sujet', 5, 'demo'),
  ('30000000-0000-0000-0000-0000000000b2', '20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 1, 'grand_public', 'comprendre', 'comprendre_sujet', 5, 'demo');
insert into public.report_quizzes (owner_id, report_version_id, scope_key, questions) values
  ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a2', 'document', '[]'),
  ('00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-0000000000b2', 'section:sec_1', '[]');
do $$ begin
  insert into public.report_quizzes (owner_id, report_version_id, scope_key, questions)
    values ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a2', 'document', '[]');
  raise exception 'ECHEC : deux tests identiques pour une version';
exception when unique_violation then null;
end $$;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if (select count(*) from public.report_quizzes) <> 1 then raise exception 'ECHEC : A voit % tests', (select count(*) from public.report_quizzes); end if;
end $$;
do $$ begin
  insert into public.report_quizzes (owner_id, report_version_id, scope_key, questions)
    values ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a2', 'section:sec_2', '[]');
  raise exception 'ECHEC : test écrit par le client';
exception when insufficient_privilege then null;
end $$;
reset role;
delete from public.reports where id = '20000000-0000-0000-0000-0000000000a2';
do $$ begin
  if exists (select 1 from public.report_quizzes where owner_id = '00000000-0000-0000-0000-00000000000a') then
    raise exception 'ECHEC : test conservé après suppression du rapport';
  end if;
end $$;

select 'RECETTE SQL : OK' as resultat;
