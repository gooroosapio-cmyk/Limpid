-- Avis de sécurité Supabase (5 octobre 2026) : fonctions SECURITY DEFINER encore appelables
-- via /rest/v1/rpc par les clients.
-- is_admin() n'est utilisée ni par une politique RLS ni par l'application (le rôle admin est
-- vérifié côté serveur avec la clé service_role) : plus aucun client ne peut l'appeler.
revoke execute on function public.is_admin() from public, anon, authenticated;

-- rls_auto_enable() : fonction d'event trigger créée par la plateforme (hors migrations du dépôt),
-- qui active la RLS sur chaque nouvelle table. Elle ne sert qu'en déclencheur : on retire
-- l'exécution aux clients, sans toucher au déclencheur lui-même.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
