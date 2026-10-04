-- Les identifiants du moteur (seg_1, ev_1…) sont locaux à une source ou à un objet de
-- connaissance : les clés primaires deviennent composites pour éviter toute collision
-- entre rapports. Tables encore vides au moment de cette migration.
alter table public.evidence drop constraint evidence_segment_id_fkey;
alter table public.evidence drop constraint evidence_pkey;
alter table public.source_segments drop constraint source_segments_pkey;
alter table public.source_segments add primary key (source_id, id);

alter table public.evidence
  add column knowledge_id uuid not null references public.knowledge_objects(id) on delete cascade;
alter table public.evidence add primary key (knowledge_id, id);
alter table public.evidence
  add constraint evidence_segment_fkey foreign key (source_id, segment_id)
  references public.source_segments(source_id, id) on delete cascade;
create index evidence_knowledge_idx on public.evidence (knowledge_id);

-- Le worker (service_role) réserve les tâches ; les clients n'y ont jamais accès.
grant execute on function public.claim_job(text, integer) to service_role;
