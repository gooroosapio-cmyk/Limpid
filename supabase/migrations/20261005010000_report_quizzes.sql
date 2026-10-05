-- Limpid V3.1 : tests « Me tester » (Interrogation d'une partie, Devoir sur tout le document).
-- QCM rédigé à partir des explications d'une version de rapport, gardé pour la rouvrir sans
-- nouvel appel IA ; effacé avec la version (et donc avec le rapport ou le compte).

create table public.report_quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  report_version_id uuid not null references public.report_versions(id) on delete cascade,
  scope_key text not null check (scope_key = 'document' or scope_key ~ '^section:[a-z]{1,6}_[A-Za-z0-9_-]{1,64}$'),
  questions jsonb not null check (jsonb_typeof(questions) = 'array'),
  created_at timestamptz not null default now(),
  unique (report_version_id, scope_key)
);
create index report_quizzes_owner_idx on public.report_quizzes (owner_id);

alter table public.report_quizzes enable row level security;
-- Lecture par le propriétaire ; écriture réservée au serveur (service_role).
create policy "tests : lecture" on public.report_quizzes for select using (owner_id = auth.uid());
