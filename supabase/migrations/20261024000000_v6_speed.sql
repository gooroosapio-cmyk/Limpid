-- V6, vitesse : point de reprise « publication » (version publiée pendant la rédaction, puis
-- complétée) pour la publication progressive. Contrainte élargie seulement.
alter table public.generation_checkpoints drop constraint if exists generation_checkpoints_stage_check;
alter table public.generation_checkpoints add constraint generation_checkpoints_stage_check
  check (stage ~ '^(comprehension|explication|plan|publication|frag_[0-9]{1,3}|chap_[0-9]{1,3})$');
