-- Limitation des essais de connexion (cahier V2, § 18) : clés hachées (adresse ou IP),
-- jamais l'adresse en clair. Fenêtre glissante, aucun verrouillage permanent.
create table public.auth_attempts (
  id bigint generated always as identity primary key,
  key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'),
  kind text not null check (kind in ('password', 'reset')),
  created_at timestamptz not null default now()
);
create index auth_attempts_key_idx on public.auth_attempts (key_hash, created_at);
-- Accès serveur uniquement (clé service_role) : aucune policy client.
alter table public.auth_attempts enable row level security;
