-- Bibliothèque V2 (galerie) : favori et couverture choisie (banque décorative). Ajouts seulement.
alter table public.reports add column if not exists favorite boolean not null default false;
alter table public.reports add column if not exists cover_id text
  constraint reports_cover_id_check check (cover_id is null or cover_id ~ '^[a-z]{3,20}$');
create index if not exists reports_owner_favorite_idx on public.reports (owner_id) where favorite and deleted_at is null;
