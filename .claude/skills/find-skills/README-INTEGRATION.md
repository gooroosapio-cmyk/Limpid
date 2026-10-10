# Find Skills : intégration Limpid

Le skill conserve les instructions de `vercel-labs/skills` au commit `671e8c320810d36fed80fac5f1a2c1bf7e82d812`. L'original exact est dans `references/upstream-skill.md` ; le `SKILL.md` actif ajoute un préambule explicite, sans supprimer le texte amont.

## Portée

- Chercher et recommander quand un besoin pertinent existe.
- Examiner les sources, la licence, la version, les scripts et les permissions. Un nombre d'installations ou d'étoiles ne constitue pas un audit de sécurité.
- Demander l'accord pour chaque nouvelle installation ou mise à jour, en précisant skill, source/version, dossier et portée. La présence de ce skill ne donne aucune autorisation permanente.
- Ne pas lancer automatiquement les exemples d'installation globale `-g`, de confirmation ignorée `-y`, de mise à jour générale ou d'initialisation.
- Privilégier la consultation web des sources publiques. Ne pas transmettre d'informations privées dans les recherches.

## CLI et télémétrie

`npx skills` n'est ni fourni, ni installé, ni exécuté ici. `npx` peut télécharger puis exécuter du code. L'exécution d'un CLI doit être autorisée selon les règles de l'environnement, avec une version épinglée.

Dans la version examinée, le [code de télémétrie](https://github.com/vercel-labs/skills/blob/671e8c320810d36fed80fac5f1a2c1bf7e82d812/src/telemetry.ts) prévoit notamment l'envoi de la requête de recherche, du nombre de résultats, de la version du CLI et du nom de l'agent à skills.sh. Ce mécanisme est actif par défaut. Le [README amont](https://github.com/vercel-labs/skills/blob/671e8c320810d36fed80fac5f1a2c1bf7e82d812/README.md#telemetry) indique que `DISABLE_TELEMETRY=1` ou `DO_NOT_TRACK=1` désactive télémétrie et requêtes d'audit.

Pour une recherche CLI autorisée, le préambule local demande ces deux variables pour la seule invocation concernée. La recherche reste connectée au réseau. Ne jamais inclure de secrets ou de détails confidentiels dans la requête.

Cette intégration n'ajoute aucun hook, jeton, permission ou réglage global.
