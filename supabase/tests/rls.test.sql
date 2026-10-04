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

-- Utilisateur A
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if (select count(*) from public.reports) <> 1 then raise exception 'ECHEC : A voit % rapports', (select count(*) from public.reports); end if;
  if exists (select 1 from public.sources where title = 'Source B') then raise exception 'ECHEC : A voit la source de B'; end if;
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
end $$;
reset role;

select 'RECETTE SQL : OK' as resultat;
