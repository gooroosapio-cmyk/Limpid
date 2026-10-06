-- V6, vitesse : point de reprise « publication » (version publiée pendant la rédaction, puis
-- complétée) pour la publication progressive. Contrainte élargie seulement.
alter table public.generation_checkpoints drop constraint if exists generation_checkpoints_stage_check;
alter table public.generation_checkpoints add constraint generation_checkpoints_stage_check
  check (stage ~ '^(comprehension|explication|plan|publication|frag_[0-9]{1,3}|chap_[0-9]{1,3})$');

-- V6, approches : Par défaut, Livre interactif, Parcours guidé, Atelier visuel. Les approches V4
-- restent valides pour les cours déjà produits (contraintes élargies seulement).
alter table public.report_versions drop constraint if exists report_versions_mode_check;
alter table public.report_versions add constraint report_versions_mode_check
  check (mode in ('tres_simple', 'claire', 'resume', 'revision', 'auto', 'livre', 'parcours', 'atelier'));
alter table public.reports drop constraint if exists reports_mode_check;
alter table public.reports add constraint reports_mode_check
  check (mode in ('tres_simple', 'claire', 'resume', 'revision', 'auto', 'livre', 'parcours', 'atelier'));
alter table public.reader_preferences drop constraint if exists reader_preferences_default_mode_check;
alter table public.reader_preferences add constraint reader_preferences_default_mode_check
  check (default_mode in ('tres_simple', 'claire', 'resume', 'revision', 'auto', 'livre', 'parcours', 'atelier'));
