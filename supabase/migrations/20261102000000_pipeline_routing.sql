-- Routage et OCR ciblé (spécification du 14 octobre 2026, § 8 et § 9.2).
--
-- 1. Rédacteur des nouveaux cours choisi par l'administration (test comparatif) : Luna Pro
--    (« pro », comportement actuel) ou Luna standard (« standard », cible).
-- 2. Points de reprise des lots OCR (« ocr_<source>_<première page> ») : un lot lu n'est jamais
--    relu ni refacturé après une interruption.
--
-- Réversible : voir « down » en fin de fichier.

alter table public.app_settings
  add column if not exists writer_model text not null default 'pro' check (writer_model in ('pro', 'standard'));

alter table public.generation_checkpoints drop constraint if exists generation_checkpoints_stage_check;
alter table public.generation_checkpoints add constraint generation_checkpoints_stage_check
  check (stage ~ '^(comprehension|explication|plan|publication|frag_[0-9]{1,3}|chap_[0-9]{1,3}|lot_[0-9]{1,3}|ocr_[0-9]{1,2}_[0-9]{1,5})$');

-- down (manuel) :
--   delete from public.generation_checkpoints where stage like 'ocr_%';
--   rétablir generation_checkpoints_stage_check (20261031000000_learning_supports.sql) ;
--   alter table public.app_settings drop column writer_model;
