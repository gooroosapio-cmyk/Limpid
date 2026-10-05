-- Recette SQL des sessions d'appareil (V2, T09-T12).
\set ON_ERROR_STOP 1
insert into public.allowed_emails (email, role) values ('s@test.fr', 'user'), ('adm@test.fr', 'admin');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 's@test.fr'),
  ('00000000-0000-0000-0000-0000000000b2', 'adm@test.fr');

do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000000b1';
  a uuid := '00000000-0000-0000-0000-0000000000b2';
  s1 uuid := '10000000-0000-0000-0000-0000000000b1';
  s2 uuid := '10000000-0000-0000-0000-0000000000b2';
  s3 uuid := '10000000-0000-0000-0000-0000000000b3';
  sa uuid := '10000000-0000-0000-0000-0000000000ba';
begin
  -- Nouvel appareil : accepté et enregistré.
  if public.touch_session(s1, u, 'Firefox', true) <> 'ok' then raise exception 'ECHEC : nouvelle session refusée'; end if;
  -- Six jours sans activité : encore valable, et l'activité prolonge.
  update public.user_sessions set last_activity_at = now() - interval '6 days 23 hours' where session_id = s1;
  if public.touch_session(s1, u, 'Firefox', true) <> 'ok' then raise exception 'ECHEC : session de moins de 7 jours refusée'; end if;
  if (select last_activity_at from public.user_sessions where session_id = s1) < now() - interval '1 minute' then
    raise exception 'ECHEC : activité interactive non enregistrée';
  end if;
  -- Sept jours et une minute : refusée AVANT toute prolongation, et le reste.
  update public.user_sessions set last_activity_at = now() - interval '7 days 1 minute' where session_id = s1;
  if public.touch_session(s1, u, 'Firefox', true) <> 'inactive' then raise exception 'ECHEC : session inactive acceptée'; end if;
  if public.touch_session(s1, u, 'Firefox', true) <> 'inactive' then raise exception 'ECHEC : session expirée ressuscitée'; end if;

  -- Requête d'arrière-plan : ne prolonge pas.
  perform public.touch_session(s2, u, 'Safari', true);
  update public.user_sessions set last_activity_at = now() - interval '3 days' where session_id = s2;
  perform public.touch_session(s2, u, 'Safari', false);
  if (select last_activity_at from public.user_sessions where session_id = s2) > now() - interval '2 days' then
    raise exception 'ECHEC : un sondage en arrière-plan a prolongé la session';
  end if;
  -- Un autre appareil actif ne prolonge pas celui-ci.
  perform public.touch_session(s3, u, 'Chrome', true);
  if (select last_activity_at from public.user_sessions where session_id = s2) > now() - interval '2 days' then
    raise exception 'ECHEC : l''activité d''un autre appareil a prolongé la session';
  end if;
  -- Plafond absolu de 90 jours, même avec de l'activité.
  update public.user_sessions set created_at = now() - interval '91 days' where session_id = s3;
  if public.touch_session(s3, u, 'Chrome', true) <> 'absolute' then raise exception 'ECHEC : plafond de 90 jours ignoré'; end if;
  -- Déconnexion à distance.
  update public.user_sessions set revoked_at = now(), revoked_reason = 'revoked' where session_id = s2;
  if public.touch_session(s2, u, 'Safari', true) <> 'revoked' then raise exception 'ECHEC : appareil déconnecté encore accepté'; end if;
  -- Une session ne change pas de propriétaire.
  if public.touch_session(s3, a, 'Chrome', true) <> 'revoked' then raise exception 'ECHEC : session réutilisée par un autre compte'; end if;

  -- Administrateur : 30 minutes d'inactivité, 12 heures au plus.
  perform public.touch_session(sa, a, 'Edge', true);
  update public.user_sessions set last_activity_at = now() - interval '31 minutes' where session_id = sa;
  if public.touch_session(sa, a, 'Edge', true) <> 'inactive_admin' then raise exception 'ECHEC : session admin inactive acceptée'; end if;
end $$;

do $$ begin
  if has_function_privilege('authenticated', 'public.touch_session(uuid, uuid, text, boolean)', 'execute') then
    raise exception 'ECHEC : touch_session appelable par un client';
  end if;
end $$;

select 'RECETTE SESSIONS : OK' as resultat;
