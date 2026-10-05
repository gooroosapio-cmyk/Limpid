-- Imitation minimale de l'environnement Supabase pour tester la migration sur un Postgres nu.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to authenticated, anon;
-- Comme Supabase : toute nouvelle fonction du schéma public est exécutable par les rôles de l'API.
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
