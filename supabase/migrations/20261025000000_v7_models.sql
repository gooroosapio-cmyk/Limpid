-- V7, modèles (comparatif IA du 6 octobre 2026) : toutes les images passent par l'API Images
-- d'OpenRouter. Recraft V4.1 Flash (illustrations simples), Recraft V4.1 Vector (SVG, banque
-- Limpid d'abord), Seedream 5.0 Flash (scènes, schémas annotés, couverture de secours).
-- Ajouts et réglages seulement : aucune donnée de cours touchée.

-- Familles de modèles d'image autorisées (Seedream ajouté).
alter table public.app_settings drop constraint if exists app_settings_image_vector_provider_check;
alter table public.app_settings add constraint app_settings_image_vector_provider_check
  check (image_vector_provider in ('recraft', 'seedream', 'nanobanana'));
alter table public.app_settings drop constraint if exists app_settings_image_realistic_provider_check;
alter table public.app_settings add constraint app_settings_image_realistic_provider_check
  check (image_realistic_provider in ('recraft', 'seedream', 'nanobanana'));
alter table public.app_settings drop constraint if exists app_settings_image_diagram_provider_check;
alter table public.app_settings add constraint app_settings_image_diagram_provider_check
  check (image_diagram_provider in ('recraft', 'seedream', 'nanobanana'));

-- Nouveau type : illustration simple (image).
alter table public.app_settings
  add column if not exists image_illustration_provider text not null default 'recraft'
    check (image_illustration_provider in ('recraft', 'seedream', 'nanobanana')),
  add column if not exists image_illustration_model text not null default 'recraft/recraft-v4.1-flash'
    check (image_illustration_model ~ '^[a-z0-9._/-]{3,80}$');

-- Nouveaux défauts (identifiants OpenRouter) ; les anciens identifiants de l'API Recraft directe
-- n'existent plus : réglages remis aux défauts du comparatif.
alter table public.app_settings alter column image_vector_model set default 'recraft/recraft-v4.1-vector';
alter table public.app_settings alter column image_realistic_provider set default 'seedream';
alter table public.app_settings alter column image_realistic_model set default 'bytedance-seed/seedream-5-0-flash';
alter table public.app_settings alter column image_diagram_provider set default 'seedream';
alter table public.app_settings alter column image_diagram_model set default 'bytedance-seed/seedream-5-0-flash';
update public.app_settings set
  image_illustration_provider = 'recraft', image_illustration_model = 'recraft/recraft-v4.1-flash',
  image_vector_provider = 'recraft', image_vector_model = 'recraft/recraft-v4.1-vector',
  image_realistic_provider = 'seedream', image_realistic_model = 'bytedance-seed/seedream-5-0-flash',
  image_diagram_provider = 'seedream', image_diagram_model = 'bytedance-seed/seedream-5-0-flash';

-- Actifs générés par Seedream.
alter table public.visual_assets drop constraint if exists visual_assets_provider_check;
alter table public.visual_assets add constraint visual_assets_provider_check
  check (provider in ('commons', 'unsplash', 'gemini', 'recraft', 'seedream'));

-- Banque SVG Limpid : dessins vectoriels réutilisables d'un cours à l'autre. Aucune donnée de
-- compte, de document ni de cours : mots-clés génériques et fichier assaini. Accès serveur
-- seulement (RLS activée sans politique).
create table if not exists public.svg_library (
  id uuid primary key default gen_random_uuid(),
  sha256 text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  keywords text[] not null check (cardinality(keywords) between 1 and 6),
  query text not null check (char_length(query) <= 120),
  storage_path text not null check (storage_path ~ '^library/svg/[0-9a-f]{64}\.svg$'),
  width integer not null check (width between 1 and 8192),
  height integer not null check (height between 1 and 8192),
  model text check (model is null or char_length(model) <= 120),
  uses integer not null default 0 check (uses >= 0),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists svg_library_keywords_idx on public.svg_library using gin (keywords);
alter table public.svg_library enable row level security;
revoke all on public.svg_library from anon, authenticated;
