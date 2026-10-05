-- Limpid V5 : un Limpid peut reposer sur plusieurs documents (« Limpid commun »).
-- Ajouts uniquement : les rapports existants gardent leurs identifiants et leur source.

-- Ensemble de sources d'un rapport, dans l'ordre de lecture choisi à l'import.
-- reports.source_id reste la première source (compatibilité des anciens écrans et exports).
create table public.report_sources (
  report_id uuid not null references public.reports(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  position smallint not null check (position between 0 and 9),
  created_at timestamptz not null default now(),
  primary key (report_id, source_id),
  unique (report_id, position)
);
create index report_sources_source_idx on public.report_sources (source_id);
create index report_sources_owner_idx on public.report_sources (owner_id);
alter table public.report_sources enable row level security;
create policy "sources du rapport : lecture" on public.report_sources for select using (owner_id = auth.uid());

-- Les rapports déjà créés reçoivent leur unique source en position 0.
insert into public.report_sources (report_id, source_id, owner_id, position)
select id, source_id, owner_id, 0 from public.reports where source_id is not null
on conflict do nothing;

-- Empreinte du fichier envoyé : un doublon exact dans le même compte est signalé (jamais
-- comparé aux fichiers d'un autre compte).
alter table public.sources add column file_sha256 text check (file_sha256 is null or file_sha256 ~ '^[a-f0-9]{64}$');
create index sources_owner_sha_idx on public.sources (owner_id, file_sha256) where file_sha256 is not null;
