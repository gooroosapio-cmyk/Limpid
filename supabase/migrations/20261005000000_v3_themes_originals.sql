-- Limpid V3 : cinq thèmes éditoriaux (null = choix automatique selon l'organisation du rapport)
-- et conservation de l'original 30 jours (comme le rapport) pour « Ouvrir le PDF ».

alter table public.reports drop constraint if exists reports_theme_id_check;
alter table public.reports alter column theme_id drop not null, alter column theme_id drop default;
update public.reports set theme_id = case theme_id when 'essentiel' then 'dossier' when 'visuel' then 'guide' else null end;
alter table public.reports add constraint reports_theme_id_check
  check (theme_id is null or theme_id in ('sciences', 'recit', 'dossier', 'guide', 'confort'));

alter table public.reader_preferences drop constraint if exists reader_preferences_theme_id_check;
update public.reader_preferences set theme_id = case theme_id when 'essentiel' then 'dossier' when 'visuel' then 'guide' else null end;
alter table public.reader_preferences add constraint reader_preferences_theme_id_check
  check (theme_id is null or theme_id in ('sciences', 'recit', 'dossier', 'guide', 'confort'));

comment on column public.sources.original_purge_at is 'Purge du fichier original (30 jours après lecture, comme le rapport ; 24 h pour un envoi non utilisé)';
