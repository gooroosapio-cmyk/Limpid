-- Les fonctions SECURITY DEFINER ne doivent pas être appelables via /rest/v1/rpc par les clients.
-- force_owner et handle_new_user ne servent qu'en trigger ; is_admin n'est utile que côté serveur.
revoke execute on function public.force_owner() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
