-- Limpid : schéma initial de l'alpha privée.
-- Chaque donnée privée porte owner_id ; RLS active partout ; le navigateur n'est jamais
-- l'autorité sur le propriétaire (owner_id est forcé à auth.uid() par trigger).
-- Le worker et l'administration utilisent la clé service_role côté serveur uniquement.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- utilitaires

create or replace function public.force_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Les appels avec la clé service_role (auth.uid() nul) gardent la valeur fournie par le serveur.
  if auth.uid() is not null then
    new.owner_id := auth.uid();
  end if;
  return new;
end $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- profils et rôles

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Liste blanche : seules ces adresses obtiennent un profil (inscriptions fermées).
create table public.allowed_emails (
  email text primary key check (email = lower(email)),
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r text;
begin
  select role into r from public.allowed_emails where email = lower(new.email);
  if r is null then
    raise exception 'Adresse non autorisée pour cette alpha privée';
  end if;
  insert into public.profiles (id, role) values (new.id, r);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- préférences de lecture

create table public.reader_preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  goal text check (goal in ('comprendre', 'reviser', 'appliquer', 'decider')),
  familiarity text check (familiarity in ('aucune', 'bases', 'maitrise')),
  aids text[] not null default '{}' check (aids <@ array['analogies', 'exemples', 'schemas', 'texte']),
  minutes smallint check (minutes in (3, 7, 12)),
  density text check (density in ('essentiel', 'equilibre', 'approfondi')),
  example_domain text check (example_domain in ('quotidien', 'travail', 'sciences', 'sans_preference')),
  updated_at timestamptz not null default now()
);
create trigger reader_preferences_owner before insert or update on public.reader_preferences
  for each row execute function public.force_owner();
create trigger reader_preferences_touch before update on public.reader_preferences
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- sources

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('pdf', 'docx', 'txt', 'png', 'jpeg', 'webp', 'paste', 'url')),
  title text not null check (char_length(title) between 1 and 300),
  original_url text check (original_url is null or original_url ~ '^https?://'),
  storage_path text,                -- chemin privé de l'original, effacé à la purge
  content_hash text check (content_hash ~ '^[a-f0-9]{64}$'),
  byte_size integer check (byte_size >= 0),
  page_count integer check (page_count >= 0),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'extracting', 'extracted', 'partial', 'unreadable', 'rejected', 'deleted')),
  coverage jsonb,                   -- segments traités / totaux, zones illisibles
  rejection_code text,
  original_purge_at timestamptz,    -- purge du fichier original (24 h par défaut)
  original_purged_at timestamptz,
  is_demo boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sources_owner_idx on public.sources (owner_id, created_at desc);
create index sources_purge_idx on public.sources (original_purge_at) where original_purged_at is null;
create trigger sources_owner before insert on public.sources for each row execute function public.force_owner();
create trigger sources_touch before update on public.sources for each row execute function public.touch_updated_at();

create table public.source_segments (
  id text primary key,              -- identifiant stable fourni par l'application (seg_…)
  source_id uuid not null references public.sources(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_version text not null check (source_version ~ '^[a-f0-9]{64}$'),
  ordinal integer not null check (ordinal >= 0),
  locator jsonb not null,
  text text not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  extraction_warnings text[] not null default '{}',
  unique (source_id, ordinal)
);
create index source_segments_owner_idx on public.source_segments (owner_id);

create table public.evidence (
  id text primary key,              -- ev_…
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  segment_id text not null references public.source_segments(id) on delete cascade,
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null,
  quote text not null check (char_length(quote) between 1 and 1000),
  check (end_offset > start_offset)
);
create index evidence_source_idx on public.evidence (source_id);

-- ---------------------------------------------------------------- objets du moteur

create table public.knowledge_objects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  source_version text not null,
  schema_version text not null,
  prompt_version text not null,
  model text not null,
  body jsonb not null,
  validation jsonb not null,
  created_at timestamptz not null default now()
);
create index knowledge_source_idx on public.knowledge_objects (source_id, source_version);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  current_version_id uuid,
  is_demo boolean not null default false,
  deleted_at timestamptz,           -- marqueur : bloque l'accès et toute écriture tardive
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reports_owner_idx on public.reports (owner_id, created_at desc) where deleted_at is null;
create trigger reports_owner before insert on public.reports for each row execute function public.force_owner();
create trigger reports_touch before update on public.reports for each row execute function public.touch_updated_at();

create table public.report_versions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  parent_version_id uuid references public.report_versions(id) on delete set null,
  knowledge_id uuid references public.knowledge_objects(id) on delete set null,
  level text not null check (level in ('ultra_simple', 'grand_public', 'etudiant', 'professionnel', 'expert_presse')),
  goal text not null check (goal in ('comprendre', 'reviser', 'appliquer', 'decider')),
  template_id text not null
    check (template_id in ('comprendre_sujet', 'expliquer_document', 'comprendre_processus', 'comparer_options')),
  target_pages smallint not null check (target_pages in (5, 7, 12)),
  explanation jsonb,
  blueprint jsonb,
  validation jsonb,
  check_status text not null default 'pending' check (check_status in ('pending', 'validated', 'incomplete')),
  change_reason text,               -- « plus simple », « autre exemple », génération initiale…
  provider text not null,
  model text,
  prompt_version text,
  created_at timestamptz not null default now(),
  unique (report_id, version_number)
);
alter table public.reports
  add constraint reports_current_version_fk
  foreign key (current_version_id) references public.report_versions(id) on delete set null;

-- ---------------------------------------------------------------- tâches

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid references public.reports(id) on delete cascade,
  source_id uuid references public.sources(id) on delete cascade,
  kind text not null check (kind in ('generate_report', 'reexplain_section', 'comprehension_check', 'export_pdf', 'purge')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  params jsonb not null default '{}',
  status text not null default 'queued' check (status in
    ('queued', 'running', 'awaiting_confirmation', 'succeeded', 'incomplete_check', 'failed', 'cancelled', 'uncertain')),
  stage text check (stage in ('validation', 'extraction', 'comprehension', 'explication', 'verification', 'mise_en_page')),
  stage_attempt smallint not null default 0 check (stage_attempt between 0 and 3),
  checkpoint jsonb,
  error_code text,                  -- code public, jamais de contenu privé
  cancel_requested boolean not null default false,
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);
create index jobs_claim_idx on public.jobs (status, created_at) where status in ('queued', 'running');
create index jobs_owner_idx on public.jobs (owner_id, created_at desc);
create trigger jobs_owner before insert on public.jobs for each row execute function public.force_owner();
create trigger jobs_touch before update on public.jobs for each row execute function public.touch_updated_at();

-- Transitions autorisées (miroir de src/lib/jobs/state.ts).
create or replace function public.check_job_transition()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = old.status then return new; end if;
  if not (
    (old.status = 'queued' and new.status in ('running', 'cancelled')) or
    (old.status = 'running' and new.status in
      ('awaiting_confirmation', 'succeeded', 'incomplete_check', 'failed', 'cancelled', 'uncertain', 'queued')) or
    (old.status = 'awaiting_confirmation' and new.status in ('queued', 'cancelled')) or
    (old.status = 'uncertain' and new.status in ('queued', 'failed', 'cancelled')) or
    (old.status = 'failed' and new.status = 'queued')
  ) then
    raise exception 'Transition interdite : % -> %', old.status, new.status;
  end if;
  return new;
end $$;
create trigger jobs_transition before update on public.jobs
  for each row execute function public.check_job_transition();

-- Réservation atomique d'une tâche par un worker (bail renouvelable par heartbeat).
create or replace function public.claim_job(p_worker text, p_lease_seconds integer)
returns setof public.jobs language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.jobs j
     set status = 'running',
         lease_owner = p_worker,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         heartbeat_at = now(),
         started_at = coalesce(j.started_at, now())
   where j.id = (
     select id from public.jobs
      where not cancel_requested
        and (status = 'queued' or (status = 'running' and lease_expires_at < now()))
      order by created_at
      for update skip locked
      limit 1)
  returning j.*;
end $$;
revoke all on function public.claim_job(text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------- consommation et budget

create table public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  stage text not null,
  attempt smallint not null,
  provider text not null,
  model text not null,
  status text not null check (status in ('reserved', 'settled', 'released', 'uncertain')),
  reserved_cents integer not null check (reserved_cents >= 0),
  actual_cents integer check (actual_cents >= 0),
  input_tokens integer,
  output_tokens integer,
  duration_ms integer,
  provider_request_id text,
  price_basis text,                 -- tarif utilisé et date de vérification
  created_at timestamptz not null default now(),
  unique (job_id, stage, attempt)   -- pas de double débit pour la même tentative
);
create index usage_owner_day_idx on public.usage_ledger (owner_id, created_at);
create index usage_month_idx on public.usage_ledger (created_at);

create table public.app_settings (
  id boolean primary key default true check (id),
  generation_enabled boolean not null default true,   -- coupe-circuit global
  monthly_cap_cents integer not null default 1000,
  provider text not null default 'gemini',
  model_fast text,
  model_quality text,
  updated_at timestamptz not null default now()
);
insert into public.app_settings default values;

-- ---------------------------------------------------------------- exports et suppression

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  report_version_id uuid not null references public.report_versions(id) on delete cascade,
  storage_path text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  page_count integer,
  render_checks jsonb,
  created_at timestamptz not null default now(),
  unique (report_version_id)        -- un export par version immuable, pas de rendu IA répété
);

create table public.comprehension_answers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  report_version_id uuid not null references public.report_versions(id) on delete cascade,
  check_id text not null,
  answer text not null check (char_length(answer) between 1 and 2000),
  feedback jsonb,
  created_at timestamptz not null default now()
);

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  target_kind text not null check (target_kind in ('report', 'source', 'account', 'preferences')),
  target_id uuid,
  status text not null default 'pending' check (status in ('pending', 'done', 'partial', 'failed')),
  result jsonb,                     -- compte rendu sans contenu
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Journal des actions sensibles (admin, suppressions) : jamais de contenu privé.
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target_kind text,
  target_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- écritures tardives

-- Toute écriture sur un rapport supprimé est refusée, y compris par le worker.
create or replace function public.block_writes_on_deleted_report()
returns trigger language plpgsql set search_path = public as $$
declare
  rid uuid;
begin
  rid := case tg_table_name
    when 'report_versions' then new.report_id
    when 'jobs' then new.report_id
    else null end;
  if rid is not null and exists (select 1 from public.reports where id = rid and deleted_at is not null) then
    raise exception 'Rapport supprimé : écriture refusée';
  end if;
  return new;
end $$;
create trigger report_versions_block_deleted before insert or update on public.report_versions
  for each row execute function public.block_writes_on_deleted_report();
create trigger jobs_block_deleted before insert on public.jobs
  for each row execute function public.block_writes_on_deleted_report();

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.allowed_emails enable row level security;
alter table public.reader_preferences enable row level security;
alter table public.sources enable row level security;
alter table public.source_segments enable row level security;
alter table public.evidence enable row level security;
alter table public.knowledge_objects enable row level security;
alter table public.reports enable row level security;
alter table public.report_versions enable row level security;
alter table public.jobs enable row level security;
alter table public.usage_ledger enable row level security;
alter table public.app_settings enable row level security;
alter table public.exports enable row level security;
alter table public.comprehension_answers enable row level security;
alter table public.deletion_requests enable row level security;
alter table public.audit_log enable row level security;

create policy "profil personnel" on public.profiles for select using (id = auth.uid());

create policy "préférences : lecture" on public.reader_preferences for select using (owner_id = auth.uid());
create policy "préférences : création" on public.reader_preferences for insert with check (owner_id = auth.uid());
create policy "préférences : modification" on public.reader_preferences for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "préférences : effacement" on public.reader_preferences for delete using (owner_id = auth.uid());

-- Lecture seule pour l'utilisateur : toutes les écritures passent par les routes serveur.
create policy "sources : lecture" on public.sources for select
  using (owner_id = auth.uid() and deleted_at is null);
create policy "segments : lecture" on public.source_segments for select using (
  owner_id = auth.uid()
  and exists (select 1 from public.sources s where s.id = source_id and s.deleted_at is null));
create policy "preuves : lecture" on public.evidence for select using (
  owner_id = auth.uid()
  and exists (select 1 from public.sources s where s.id = source_id and s.deleted_at is null));
create policy "rapports : lecture" on public.reports for select
  using (owner_id = auth.uid() and deleted_at is null);
create policy "versions : lecture" on public.report_versions for select using (
  owner_id = auth.uid()
  and exists (select 1 from public.reports r where r.id = report_id and r.deleted_at is null));
create policy "jobs : lecture" on public.jobs for select using (owner_id = auth.uid());
create policy "exports : lecture" on public.exports for select using (owner_id = auth.uid());
create policy "réponses : lecture" on public.comprehension_answers for select using (owner_id = auth.uid());
create policy "suppressions : lecture" on public.deletion_requests for select using (owner_id = auth.uid());
create policy "consommation : lecture" on public.usage_ledger for select using (owner_id = auth.uid());

-- knowledge_objects, app_settings, allowed_emails, audit_log : aucun accès client direct.

-- ---------------------------------------------------------------- stockage privé

insert into storage.buckets (id, name, public, file_size_limit)
values ('sources', 'sources', false, 20971520), ('exports', 'exports', false, 52428800)
on conflict (id) do nothing;
-- Aucune policy client sur storage.objects pour ces buckets : l'accès passe par des
-- URL signées à courte durée générées côté serveur après contrôle du propriétaire.
