-- Lecteur V3 : projections Livre / Guidé / Visuel / Auto, activées par l'administrateur.
alter table public.app_settings
  add column if not exists reader_v3_enabled boolean not null default false;
