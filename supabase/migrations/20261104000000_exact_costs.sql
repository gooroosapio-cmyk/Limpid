-- Coût exact des appels (lot « coûts ») : centimes d'euro au dix-millième près, au lieu d'un
-- arrondi au centime supérieur par appel qui gonflait le coût d'un cours de 10 à 20 %.
--
-- Réversible : alter column … type integer using ceil(…).

alter table public.usage_ledger
  alter column reserved_cents type numeric(14,4),
  alter column actual_cents type numeric(14,4);
