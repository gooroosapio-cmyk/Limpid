-- Lot D (cahier V2, § 8-10, 15) : présentation par rapport, visuels permis, actifs d'illustration.

-- Présentation : composition seulement, changeable sans appel IA.
alter table public.reports
  add column theme_id text not null default 'editorial' check (theme_id in ('editorial', 'essentiel', 'visuel')),
  add column visual_mode text not null default 'auto' check (visual_mode in ('auto', 'schemas', 'web', 'gemini', 'aucun'));

alter table public.reader_preferences
  add column theme_id text check (theme_id in ('editorial', 'essentiel', 'visuel'));

-- Étape de recherche d'illustrations, affichée pendant la préparation.
alter table public.jobs drop constraint jobs_stage_check;
alter table public.jobs add constraint jobs_stage_check
  check (stage in ('validation', 'extraction', 'comprehension', 'explication', 'verification', 'illustrations', 'mise_en_page'));

-- Actif d'illustration : provenance et droits, distincts des preuves documentaires.
create table public.visual_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  provider text not null check (provider in ('commons', 'unsplash', 'gemini')),
  kind text not null check (kind in ('photo', 'illustration', 'generated')),
  query text not null check (char_length(query) between 2 and 60),
  source_url text check (source_url is null or source_url like 'https://%'),
  -- Unsplash : affiché depuis l'hébergeur (règles de l'API), jamais stocké ni mis dans le PDF.
  remote_url text check (remote_url is null or remote_url like 'https://images.unsplash.com/%'),
  storage_path text,
  mime text check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  width integer check (width between 16 and 4096),
  height integer check (height between 16 and 4096),
  byte_size integer check (byte_size between 1 and 5242880),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  author text check (char_length(author) <= 300),
  license text check (char_length(license) <= 120),
  license_url text check (license_url is null or license_url like 'https://%'),
  modifications text check (char_length(modifications) <= 300),
  model text check (char_length(model) <= 120),
  created_at timestamptz not null default now(),
  check (storage_path is not null or remote_url is not null)
);
create index visual_assets_report on public.visual_assets (report_id);
create index visual_assets_owner_month on public.visual_assets (owner_id, provider, created_at);
create trigger visual_assets_owner before insert on public.visual_assets for each row execute function public.force_owner();

-- Écritures tardives refusées après suppression du rapport.
create or replace function public.block_writes_on_deleted_report()
returns trigger language plpgsql set search_path = public as $$
declare
  rid uuid;
begin
  rid := case tg_table_name
    when 'report_versions' then new.report_id
    when 'jobs' then new.report_id
    when 'visual_assets' then new.report_id
    else null end;
  if rid is not null and exists (select 1 from public.reports where id = rid and deleted_at is not null) then
    raise exception 'Rapport supprimé : écriture refusée';
  end if;
  return new;
end $$;
create trigger visual_assets_block_deleted before insert on public.visual_assets
  for each row execute function public.block_writes_on_deleted_report();

alter table public.visual_assets enable row level security;
create policy "visuels : lecture" on public.visual_assets for select using (
  owner_id = auth.uid() and exists (select 1 from public.reports r where r.id = report_id and r.deleted_at is null)
);
