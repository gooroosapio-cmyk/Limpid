# Skills de design pour Limpid

Fichiers de projet pour la branche `chore/install-claude-design-skills` de `gooroosapio-cmyk/Limpid`. Leur présence dans le dépôt et leur chargement dans Claude Code sont deux vérifications distinctes.

- **Impeccable 4.5.2** : skill officiel Claude Code, références, scripts et quatre agents associés. Le moteur attendu est **0.1.14**.
- **Web Design Guidelines 1.0.0** : skill officiel Vercel de revue UI, accessibilité et UX.
- **Stop Slop** : révision de la rédaction et réduction des tournures artificielles.
- **UI UX Pro Max** : catalogue local UI/UX et recherche Python.
- **Find Skills** : découverte de skills, avec accord spécifique requis avant toute installation.
- Impeccable et Web Design Guidelines sont copiés sans modification ; leur provenance est dans [sources.lock.json](sources.lock.json). Les trois ajouts et leurs adaptations documentées sont dans [additional-sources.lock.json](additional-sources.lock.json) et [le guide complémentaire](../../README-ADDITIONAL-SKILLS.md).

## Utilisation dans Claude Code sur le web ou mobile

1. Ouvrir une nouvelle session Claude Code avec le dépôt `gooroosapio-cmyk/Limpid` et la branche `chore/install-claude-design-skills`. Si la sélection de branche n'est pas proposée, demander à Claude de récupérer cette branche, puis vérifier qu'elle est bien utilisée avant toute modification.
2. Demander : « Quels skills sont disponibles ? Vérifie que `impeccable`, `web-design-guidelines`, `stop-slop`, `ui-ux-pro-max` et `find-skills` sont chargés depuis ce dépôt. Ne les exécute pas encore. »
3. Pour une première utilisation, lire les conditions réseau ci-dessous, puis demander par exemple `/impeccable shape interface de gestion des espaces de travail`. `init` crée le contexte produit dans `PRODUCT.md` et peut proposer la configuration du mode live : ne l'accepter que si souhaité.
4. Une fois du code UI présent, utiliser `/web-design-guidelines chemin/du/composant` pour une revue. Ne pas remplacer ce chemin par un fichier inexistant.

Les [skills de projet sont chargés dans les sessions cloud](https://code.claude.com/docs/en/skills#use-skills-in-cowork-and-cloud-sessions) lorsque leurs fichiers sont présents dans le dépôt cloné. Ils ne sont pas installés dans un compte Claude ou globalement sur un appareil. La présence des fichiers a été vérifiée ; leur chargement et leur exécution dans ta session Claude Code restent à vérifier.

## Réseau et exécution

- **Impeccable** : aucun moteur binaire n'est inclus ni exécuté par cette installation. À la première utilisation, le lanceur officiel peut télécharger le moteur depuis les [releases officielles](https://github.com/pbakaus/impeccable/releases/tag/engine-v0.1.14), vérifier sa somme SHA-256, l'enregistrer dans `~/.impeccable/bin/0.1.14/`, puis l'exécuter. Ce cache utilisateur est extérieur au dépôt et peut être partagé par Open-modus et Limpid lorsqu'ils tournent dans le même environnement. Il lui faut un environnement compatible, un accès réseau aux téléchargements GitHub, un outil de téléchargement et de vérification, et un cache accessible en écriture. Il peut aussi utiliser un moteur déjà présent. Relire cette étape avant d'autoriser son exécution ; ne pas désactiver les protections de l'environnement. Si le lanceur est indisponible ou refusé, le skill prévoit de lire le contexte du projet directement, avec des fonctions moteur indisponibles.
- **Web Design Guidelines** : le skill récupère les règles actualisées via WebFetch à chaque revue depuis `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`. Ce contenu distant n'est pas figé par le verrouillage du skill et nécessite le réseau. Si l'accès échoue, la revue complète n'est pas vérifiée.
- Aucun hook automatique, réglage de permissions, plugin, serveur MCP, secret, installateur, workflow CI ou application n'a été ajouté. Les scripts sont copiés comme fichiers ; ils ne sont pas lancés au clonage. Les skills peuvent être choisis par Claude pour une demande pertinente, conformément à leurs métadonnées amont. Ne demander `/impeccable hooks on` que si des hooks sont réellement souhaités.

## Vérifications et limites

Copies identiques aux blobs Git amont, sauf les deux SKILL.md adaptés de UI UX Pro Max et Find Skills dont les originaux sont conservés ; arborescence complète des cinq skills, liens locaux, YAML des skills et agents, JSON et syntaxe POSIX/JavaScript contrôlés statiquement. Aucun script amont ni moteur n'a été exécuté. Aucune session Claude Code n'était accessible pour un test de chargement réel. Aucun test applicatif, audit UI ou changement de l'application n'a été effectué dans cette préparation. Les contrôles portent sur les fichiers des skills ; ils ne constituent pas un test de fonctionnement de l'application.

Impeccable : [licence Apache-2.0](impeccable/LICENSE) et [notices amont](impeccable/NOTICE.md). Vercel : [déclaration MIT et limite de provenance](web-design-guidelines/UPSTREAM-NOTICE.md).

Pour mettre à jour, réexaminer une version officielle, remplacer l'ensemble cohérent des fichiers concernés et leurs empreintes, puis refaire les vérifications. Ne pas lancer automatiquement un installateur, qui pourrait aussi ajouter des hooks.
