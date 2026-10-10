# Trois skills supplémentaires pour Limpid

Ces fichiers sont préparés pour une installation **limitée au dépôt** dans `.claude/skills/`. Ils complètent le lot Impeccable + Web Design Guidelines. Ils ne modifient ni les réglages globaux, ni les autorisations, ni les hooks de Claude Code.

## Contenu

| Skill | Rôle | Source épinglée | Licence |
| --- | --- | --- | --- |
| Stop Slop | Réviser la rédaction et réduire les tournures artificielles | [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop/tree/8da1f030185bdfe8471220585162991eaeb970e9) | MIT |
| UI UX Pro Max | Chercher des recommandations UI/UX dans un catalogue local | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/50d8a7de0900119855614541f15a1a616691eb33) | MIT |
| Find Skills | Découvrir et comparer des skills avant de décider d'en installer | [vercel-labs/skills](https://github.com/vercel-labs/skills/tree/671e8c320810d36fed80fac5f1a2c1bf7e82d812/skills/find-skills) | MIT |

Les licences complètes sont conservées dans chaque dossier. Le manifeste `.claude/skills/additional-sources.lock.json` contient les chemins, commits et empreintes des 83 fichiers amont, ainsi que les adaptations locales.

## Utilisation prévue

Après publication et chargement de la branche par une session Claude Code qui lit les skills du dépôt, demander `/stop-slop`, `/ui-ux-pro-max` ou `/find-skills`, avec la tâche à traiter. Leur présence dans cette archive ne prouve pas leur activation dans une session web ou mobile existante. Aucune activation n'a été testée ici.

- **Stop Slop** : instructions textuelles et trois références. Il s'agit du dépôt original de Hardik Pandya, consacré à la rédaction. Les règles stylistiques ne doivent pas altérer des faits, citations exactes, identifiants techniques ou contraintes explicites.
- **UI UX Pro Max** : dossier amont complet, données et scripts inclus. La recherche utilise Python 3, la bibliothèque standard et les modules locaux fournis. Aucun paquet, police, moteur ou outil système n'a été installé. Si Python manque, demander à l'utilisateur de le rendre disponible ou consulter les références textuelles. `--persist` écrit des fichiers de design dans le projet ; `--force` peut les remplacer et exige une autorisation explicite.
- **Find Skills** : découverte et recommandation par défaut. Toute installation ou mise à jour ultérieure demande une approbation spécifique de la source, de la version et de la destination. Les exemples `-g -y` du texte original n'autorisent pas une installation globale ou sans confirmation. Le CLI n'est pas fourni et n'a pas été exécuté. Il peut télécharger du code, contacter des services et envoyer de la télémétrie ; voir son README local.

## Adaptations transparentes

1. UI UX Pro Max : les 11 préfixes de chemin réservés aux plugins ont été remplacés par `${CLAUDE_SKILL_DIR}`, substitution prévue pour les skills de projet par la [documentation Claude Code](https://code.claude.com/docs/en/skills#available-string-substitutions).
2. Find Skills : ajout d'un préambule chargé avec le skill, imposant la découverte d'abord et l'accord avant installation.

Les deux fichiers `SKILL.md` originaux restent disponibles dans leurs dossiers `references/upstream-skill.md`. Le manifeste distingue leurs empreintes de celles des versions adaptées.

## Vérification et limites

Vérification statique des empreintes Git, des fichiers JSON/CSV, de la syntaxe Python et des dépendances locales. Aucun installateur, CLI, script ou test amont n'a été exécuté. Les tests amont inclus sont conservés à titre de source : plusieurs nécessitent des scripts de maintenance à la racine du dépôt amont, absents de ce paquet. Ils ne constituent donc pas une suite autonome validée ici.

La publication de ces fichiers sur une branche ne prouve pas leur activation. Aucun script amont n'a été exécuté pendant leur préparation ; aucun déploiement n'est inclus.
