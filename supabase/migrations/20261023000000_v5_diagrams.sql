-- V5, images : un troisième type de visuel, les schémas (graphiques, tableaux, processus),
-- générés par Gemini au format téléphone. Les illustrations réalistes passent à Recraft quand
-- elles étaient encore sur le réglage par défaut d'origine (Nano Banana 2 Lite).
-- Ajouts et réglage seulement : aucune donnée de cours touchée.

alter table public.app_settings
  add column if not exists image_diagram_provider text not null default 'nanobanana'
    check (image_diagram_provider in ('recraft', 'nanobanana')),
  add column if not exists image_diagram_model text not null default 'google/gemini-3.1-flash-image'
    check (image_diagram_model ~ '^[a-z0-9._/-]{3,80}$');

alter table public.app_settings alter column image_realistic_provider set default 'recraft';
alter table public.app_settings alter column image_realistic_model set default 'recraftv4_1';

update public.app_settings
  set image_realistic_provider = 'recraft', image_realistic_model = 'recraftv4_1'
  where image_realistic_provider = 'nanobanana' and image_realistic_model = 'google/gemini-3.1-flash-lite-image';
