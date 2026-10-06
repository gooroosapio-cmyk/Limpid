-- V4, § 7 : plus d'expiration automatique des documents et des Limpid. Idempotent, aucune
-- suppression de données. Les échéances posées sur les originaux encore présents et utilisés
-- par un Limpid sont retirées ; un envoi jamais utilisé garde son échéance de 24 h. Les durées
-- techniques (sessions, codes, liens signés, journaux) ne sont pas concernées.

update public.sources s
   set original_purge_at = null
 where s.original_purge_at is not null
   and s.original_purged_at is null
   and (
     exists (
       select 1 from public.report_sources rs join public.reports r on r.id = rs.report_id
        where rs.source_id = s.id and r.deleted_at is null
     )
     or exists (select 1 from public.reports r where r.source_id = s.id and r.deleted_at is null)
   );

comment on column public.sources.original_purge_at is
  'Effacement prévu de l''original : null = gardé jusqu''à suppression (V4) ; 24 h pour un envoi jamais utilisé';
