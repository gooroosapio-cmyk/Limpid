-- V5, bilan final : une soumission porte une clé ; la même clé rend le même résultat
-- (double envoi, reprise réseau) sans compter deux fois. Ajout seulement.
alter table public.quiz_attempts add column if not exists attempt_key text
  check (attempt_key is null or attempt_key ~ '^[A-Za-z0-9_-]{8,80}$');
create unique index if not exists quiz_attempts_key_idx on public.quiz_attempts (owner_id, attempt_key) where attempt_key is not null;
