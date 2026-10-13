-- Prompt « Intégration des supports et des révisions illustrées » (§ 3, 5, 7, 8, 12, 13).
--
-- 1. Supports d'apprentissage demandés par Limpid (livre, parcours, carte mentale, flashcards),
--    au moins un. Anciens Limpid : « livre » (aucune génération lancée par cette migration).
-- 2. Unités de génération par support (« generate_support ») : nouvelle sorte de tâche, liée à
--    la tâche commune qui prépare la base pédagogique (params.depends_on).
-- 3. Résultats par support, versionnés sur la version du cours (base pédagogique) :
--    carte mentale (nœuds, relations) et banque de flashcards. Écriture par le serveur seul.
-- 4. Données personnelles de révision, séparées de la banque commune : progression par carte,
--    événements idempotents (clé client) et sessions reprenables.
--
-- Réversible : voir « down » en fin de fichier.

alter table public.reports
  add column if not exists requested_supports text[] not null default array['livre']::text[];
alter table public.reports drop constraint if exists reports_requested_supports_check;
alter table public.reports add constraint reports_requested_supports_check check (
  cardinality(requested_supports) between 1 and 4
  and requested_supports <@ array['livre', 'parcours', 'carte', 'flashcards']::text[]
);

alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check check (kind in
  ('generate_report', 'reexplain_section', 'comprehension_check', 'export_pdf', 'purge', 'generate_support'));

-- Points de reprise des lots de chapitres d'un support (« lot_1 », « lot_2 »…).
alter table public.generation_checkpoints drop constraint if exists generation_checkpoints_stage_check;
alter table public.generation_checkpoints add constraint generation_checkpoints_stage_check
  check (stage ~ '^(comprehension|explication|plan|publication|frag_[0-9]{1,3}|chap_[0-9]{1,3}|lot_[0-9]{1,3})$');

create table if not exists public.support_artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  -- Version du cours (base pédagogique) dont ce support est dérivé.
  report_version_id uuid not null references public.report_versions(id) on delete cascade,
  type text not null check (type in ('carte', 'flashcards')),
  version integer not null default 1 check (version >= 1),
  body jsonb not null default '{}'::jsonb check (pg_column_size(body) <= 1048576),
  validation jsonb not null default '{}'::jsonb check (pg_column_size(validation) <= 65536),
  model text check (char_length(model) <= 120),
  job_id uuid references public.jobs(id) on delete set null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (report_version_id, type)
);
create index if not exists support_artifacts_report_idx on public.support_artifacts (report_id, type, published_at desc);
alter table public.support_artifacts enable row level security;
create policy "supports : lecture" on public.support_artifacts for select using (owner_id = auth.uid());
revoke insert, update, delete on public.support_artifacts from anon, authenticated;

-- Progression personnelle par carte (une ligne par carte et par apprenant).
create table if not exists public.flashcard_progress (
  owner_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  card_id text not null check (card_id ~ '^fc_[a-z0-9]{6,40}$'),
  card_version integer not null default 1,
  schedule_version integer not null default 1,
  last_rating text check (last_rating in ('again', 'hard', 'good')),
  step smallint not null default 0 check (step between 0 and 20),
  interval_days integer not null default 0 check (interval_days between 0 and 3650),
  reviews integer not null default 0,
  lapses integer not null default 0,
  next_review_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (owner_id, report_id, card_id)
);
create index if not exists flashcard_progress_due_idx on public.flashcard_progress (owner_id, next_review_at);
alter table public.flashcard_progress enable row level security;
create policy "révisions : lecture" on public.flashcard_progress for select using (owner_id = auth.uid());
revoke insert, update, delete on public.flashcard_progress from anon, authenticated;

-- Événements d'autoévaluation : un double toucher ou un renvoi ne compte qu'une fois.
create table if not exists public.flashcard_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  session_id uuid,
  card_id text not null check (card_id ~ '^fc_[a-z0-9]{6,40}$'),
  card_version integer not null default 1,
  rating text not null check (rating in ('again', 'hard', 'good')),
  -- Note corrigée juste après coup : l'événement d'origine est remplacé, pas cumulé.
  superseded_by uuid references public.flashcard_events(id) on delete set null,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{8,100}$'),
  occurred_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);
create index if not exists flashcard_events_card_idx on public.flashcard_events (owner_id, report_id, card_id, occurred_at desc);
alter table public.flashcard_events enable row level security;
create policy "révisions : historique" on public.flashcard_events for select using (owner_id = auth.uid());
revoke insert, update, delete on public.flashcard_events from anon, authenticated;

-- Session reprenable : file de cartes, position, carte révélée.
create table if not exists public.flashcard_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  queue jsonb not null default '[]'::jsonb check (pg_column_size(queue) <= 65536),
  position integer not null default 0 check (position >= 0),
  revealed_card_id text,
  status text not null default 'active' check (status in ('active', 'done', 'abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists flashcard_sessions_owner_idx on public.flashcard_sessions (owner_id, report_id, updated_at desc);
alter table public.flashcard_sessions enable row level security;
create policy "révisions : sessions" on public.flashcard_sessions for select using (owner_id = auth.uid());
revoke insert, update, delete on public.flashcard_sessions from anon, authenticated;

-- down (manuel) :
--   drop table public.flashcard_sessions; drop table public.flashcard_events; drop table public.flashcard_progress;
--   drop table public.support_artifacts;
--   delete from public.jobs where kind = 'generate_support';
--   alter table public.jobs drop constraint jobs_kind_check;
--   alter table public.jobs add constraint jobs_kind_check check (kind in ('generate_report','reexplain_section','comprehension_check','export_pdf','purge'));
--   delete from public.generation_checkpoints where stage like 'lot_%'; rétablir generation_checkpoints_stage_check (20261024000000_v6.sql) ;
--   alter table public.reports drop constraint reports_requested_supports_check;
--   alter table public.reports drop column requested_supports;
