-- V5, images : fournisseur et modèle par type de visuel (console admin), couverture Unsplash.
-- Ajouts seulement ; valeurs par défaut = choix du cadrage (Recraft vectoriel en priorité,
-- Nano Banana 2 Lite pour les scènes réalistes).

alter table public.app_settings
  add column if not exists images_enabled boolean not null default true,
  add column if not exists image_vector_provider text not null default 'recraft'
    check (image_vector_provider in ('recraft', 'nanobanana')),
  add column if not exists image_vector_model text not null default 'recraftv4_1_vector'
    check (image_vector_model ~ '^[a-z0-9._/-]{3,80}$'),
  add column if not exists image_realistic_provider text not null default 'nanobanana'
    check (image_realistic_provider in ('recraft', 'nanobanana')),
  add column if not exists image_realistic_model text not null default 'google/gemini-3.1-flash-lite-image'
    check (image_realistic_model ~ '^[a-z0-9._/-]{3,80}$');

-- Couverture photographique Unsplash : affichée depuis Unsplash (règle de l'API), avec son crédit.
alter table public.reports
  add column if not exists cover_url text
    check (cover_url is null or (char_length(cover_url) <= 600 and cover_url ~ '^https://images\.unsplash\.com/')),
  add column if not exists cover_credit jsonb
    check (cover_credit is null or octet_length(cover_credit::text) <= 1000);
