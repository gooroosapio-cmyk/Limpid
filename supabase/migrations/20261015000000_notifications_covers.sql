-- V2.1 : notifications réelles, nom affiché, couverture générée. Ajouts seulement.

alter table public.profiles add column if not exists display_name text
  constraint profiles_display_name_check check (display_name is null or char_length(display_name) between 1 and 40);

alter table public.reports add column if not exists cover_path text
  constraint reports_cover_path_check check (cover_path is null or cover_path ~ '^covers/[0-9a-f-]{36}/[a-z0-9-]{8,64}\.(png|jpe?g|webp)$');

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('report_ready', 'report_failed', 'credits_added', 'plan_started')),
  report_id uuid references public.reports(id) on delete cascade,
  -- Référence unique de l'événement (tâche, vente) : jamais deux notifications pour le même fait.
  ref text not null check (char_length(ref) between 3 and 140),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (owner_id, ref)
);
create index if not exists notifications_owner_idx on public.notifications (owner_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (owner_id) where read_at is null;
create index if not exists notifications_report_idx on public.notifications (report_id);
alter table public.notifications enable row level security;
create policy "notifications : lecture" on public.notifications for select using (owner_id = (select auth.uid()));
