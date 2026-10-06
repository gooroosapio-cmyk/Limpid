-- Pipeline V2 (Atlas) : étape « plan » et points de reprise par étape.
-- Une génération interrompue (délai, nouvel essai) reprend après la dernière sortie validée,
-- sans repayer la compréhension ni la rédaction. Non destructif.

alter table public.jobs drop constraint if exists jobs_stage_check;
alter table public.jobs add constraint jobs_stage_check
  check (stage in ('validation', 'extraction', 'comprehension', 'verification', 'plan', 'explication', 'illustrations', 'mise_en_page'));

create table if not exists public.generation_checkpoints (
  job_id uuid not null references public.jobs(id) on delete cascade,
  stage text not null check (stage in ('comprehension', 'explication')),
  prompt_version text not null check (char_length(prompt_version) <= 40),
  payload jsonb not null check (octet_length(payload::text) <= 4000000),
  created_at timestamptz not null default now(),
  primary key (job_id, stage)
);

-- Données internes au worker : aucune lecture ni écriture depuis le navigateur.
alter table public.generation_checkpoints enable row level security;
revoke all on public.generation_checkpoints from public, anon, authenticated;
grant select, insert, update, delete on public.generation_checkpoints to service_role;
