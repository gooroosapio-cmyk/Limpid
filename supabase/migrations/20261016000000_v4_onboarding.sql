-- V4 : première connexion (questionnaire en cinq étapes, tutoriel), Accueil. Ajouts seulement,
-- idempotent. Les comptes existants sont considérés comme accueillis : leurs préférences sont
-- conservées telles quelles (aucune réinitialisation).

-- Objectif « Résumer » (Q1) en plus des objectifs existants.
alter table public.reader_preferences drop constraint if exists reader_preferences_goal_check;
alter table public.reader_preferences add constraint reader_preferences_goal_check
  check (goal in ('comprendre', 'resumer', 'reviser', 'appliquer', 'decider'));

-- Q4 : documents travaillés (trois au maximum).
alter table public.reader_preferences add column if not exists doc_types text[] not null default '{}';
alter table public.reader_preferences drop constraint if exists reader_preferences_doc_types_check;
alter table public.reader_preferences add constraint reader_preferences_doc_types_check
  check (doc_types <@ array['cours', 'pro', 'livres', 'administratif', 'autre'] and cardinality(doc_types) <= 3);

-- Avancement de l'accueil, par utilisateur et par version du questionnaire. Q5 (attribution)
-- est rangée à part des instructions pédagogiques : elle ne sert jamais à générer.
alter table public.profiles add column if not exists onboarding_version smallint;
alter table public.profiles add column if not exists onboarding_step smallint not null default 0;
alter table public.profiles add column if not exists onboarding_done_at timestamptz;
alter table public.profiles add column if not exists tutorial_done_at timestamptz;
alter table public.profiles add column if not exists acquisition text;
alter table public.profiles drop constraint if exists profiles_onboarding_step_check;
alter table public.profiles add constraint profiles_onboarding_step_check check (onboarding_step between 0 and 5);
alter table public.profiles drop constraint if exists profiles_acquisition_check;
alter table public.profiles add constraint profiles_acquisition_check
  check (acquisition is null or acquisition in ('recherche', 'reseaux', 'proche', 'ecole', 'autre', 'sans_reponse'));

-- Comptes existants (version encore nulle) : accueil considéré comme fait.
update public.profiles
   set onboarding_version = 1, onboarding_step = 5, onboarding_done_at = now(), tutorial_done_at = now()
 where onboarding_version is null;
-- Les comptes créés désormais commencent à 0 (« jamais accueilli ») : relancer cette migration
-- ne les marque donc pas comme accueillis.
alter table public.profiles alter column onboarding_version set default 0;
