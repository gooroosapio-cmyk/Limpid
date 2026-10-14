-- Enveloppe de coût par compte (spécification du 14 octobre 2026, § 7.1 et 7.2) : 30 % du
-- revenu reconnu de la période, au moins 3 FCFA par crédit engagé. « observe » : suivie dans
-- l'administration sans bloquer ; « enforce » : refus avant tout appel au-delà de l'enveloppe.
--
-- Réversible : alter table public.app_settings drop column account_cap_mode;

alter table public.app_settings
  add column if not exists account_cap_mode text not null default 'observe' check (account_cap_mode in ('observe', 'enforce'));
