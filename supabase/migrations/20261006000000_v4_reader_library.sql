-- Limpid V4 : quatre approches, plan de 1 à 18 pages, dossiers, progression de lecture,
-- tentatives de quiz conservées, exercices pré-générés, offre (filigrane des exports).
-- Ajouts uniquement : aucune donnée existante n'est modifiée ni supprimée.

-- Plan pédagogique : 1 à 18 pages (anciennes générations : 5, 7 ou 12, toujours valides).
alter table public.report_versions drop constraint report_versions_target_pages_check;
alter table public.report_versions add constraint report_versions_target_pages_check check (target_pages between 1 and 18);

-- Approche de chaque génération et du rapport (bibliothèque).
alter table public.report_versions add column mode text check (mode in ('tres_simple', 'claire', 'resume', 'revision'));
alter table public.reports add column mode text check (mode in ('tres_simple', 'claire', 'resume', 'revision'));

-- Dernier choix explicite à l'import et langue des explications.
alter table public.reader_preferences add column default_mode text check (default_mode in ('tres_simple', 'claire', 'resume', 'revision'));
alter table public.reader_preferences add column explanation_lang text check (explanation_lang in ('fr', 'en'));

-- Dossiers : supprimer un dossier ne supprime jamais ses rapports.
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create index folders_owner_idx on public.folders (owner_id, created_at);
alter table public.folders enable row level security;
create policy "dossiers : lecture" on public.folders for select using (owner_id = auth.uid());
alter table public.reports add column folder_id uuid references public.folders(id) on delete set null;

-- Progression de lecture et état lu / non lu (par compte et par rapport).
create table public.report_progress (
  owner_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  anchor text check (anchor is null or anchor ~ '^[a-z]{1,6}_[A-Za-z0-9_-]{1,64}$'),
  read_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (owner_id, report_id)
);
alter table public.report_progress enable row level security;
create policy "progression : lecture" on public.report_progress for select using (owner_id = auth.uid());

-- Tentatives de quiz et de bilan : conservées, jamais écrasées par une nouvelle tentative.
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  report_version_id uuid not null references public.report_versions(id) on delete cascade,
  kind text not null check (kind in ('bilan', 'checkpoint')),
  section_id text check (section_id is null or section_id ~ '^[a-z]{1,6}_[A-Za-z0-9_-]{1,64}$'),
  score integer not null check (score >= 0),
  total integer not null check (total between 1 and 25 and score <= total),
  answers jsonb not null check (jsonb_typeof(answers) = 'array'),
  created_at timestamptz not null default now()
);
create index quiz_attempts_owner_idx on public.quiz_attempts (owner_id, report_version_id, created_at desc);
alter table public.quiz_attempts enable row level security;
create policy "tentatives : lecture" on public.quiz_attempts for select using (owner_id = auth.uid());

-- Exercices pré-générés d'une version (points de contrôle et bilan).
alter table public.report_quizzes drop constraint report_quizzes_scope_key_check;
alter table public.report_quizzes add constraint report_quizzes_scope_key_check
  check (scope_key in ('document', 'exercises') or scope_key ~ '^section:[a-z]{1,6}_[A-Za-z0-9_-]{1,64}$');
alter table public.report_quizzes drop constraint report_quizzes_questions_check;
alter table public.report_quizzes add constraint report_quizzes_questions_check check (jsonb_typeof(questions) in ('array', 'object'));

-- Offre du compte : décide côté serveur du filigrane des exports.
alter table public.profiles add column plan text not null default 'free' check (plan in ('free', 'premium'));

-- Bibliothèque : 5 recherches récentes par compte (les plus récentes en premier).
alter table public.reader_preferences add column recent_searches jsonb not null default '[]'::jsonb
  check (jsonb_typeof(recent_searches) = 'array' and jsonb_array_length(recent_searches) <= 5);
