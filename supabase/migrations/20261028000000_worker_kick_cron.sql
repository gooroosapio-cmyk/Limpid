-- Reprise des tâches toutes les 5 minutes, déclenchée par Supabase (l'offre Vercel Hobby
-- n'autorise qu'un cron quotidien). pg_cron appelle public.kick_worker(), qui envoie le
-- relais POST /api/worker (réponse 202 immédiate, la file est vidée côté serveur).
--
-- Secrets lus dans le coffre Supabase (jamais dans ce fichier) :
--   limpid_cron_secret  (obligatoire) : même valeur que CRON_SECRET sur Vercel ;
--   limpid_worker_url   (facultatif)  : défaut https://limpid.company/api/worker.
-- Sans secret, l'appel n'est pas envoyé : la migration peut être appliquée avant le secret.

create or replace function public.kick_worker()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_url text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'limpid_cron_secret' limit 1;
  if coalesce(v_secret, '') = '' then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'limpid_worker_url' limit 1;
  return net.http_post(
    url := coalesce(nullif(v_url, ''), 'https://limpid.company/api/worker'),
    body := '{}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke execute on function public.kick_worker() from public, anon, authenticated;

-- Extensions et planification seulement là où elles existent (absentes de la base de test CI).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_net;
    create extension if not exists pg_cron;
    execute $s$select cron.schedule('limpid-worker-kick', '*/5 * * * *', 'select public.kick_worker()')$s$;
  end if;
end;
$$;
