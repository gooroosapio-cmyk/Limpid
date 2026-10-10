# Limpid : cinq skills Claude Code

Ce lot fournit Impeccable, Web Design Guidelines, Stop Slop, UI UX Pro Max et Find Skills, uniquement pour le dépôt `gooroosapio-cmyk/Limpid` et la branche `chore/install-claude-design-skills`.

## Vérifier après publication

1. Ouvrir Claude Code sur le dépôt et cette branche. Une branche seule ne suffit pas : les cinq fichiers `.claude/skills/<nom>/SKILL.md` doivent être présents dans le commit chargé.
2. Demander : « Quels skills sont disponibles ? Vérifie les cinq skills du dépôt sans les exécuter. »
3. Choisir ensuite la tâche et le skill à utiliser. Exemples : `/impeccable shape interface`, `/web-design-guidelines chemin/du/composant`, `/stop-slop texte à réviser`, `/ui-ux-pro-max interface à étudier`, `/find-skills besoin à rechercher`.

Le chargement effectif dans Claude Code web/mobile et l'exécution des outils n'ont pas été testés. Ne pas considérer une commande affichée dans un guide comme une autorisation d'installer autre chose.

## Conditions importantes

- Impeccable contient ses scripts et quatre agents, mais aucun moteur binaire. Son lanceur officiel peut télécharger, vérifier puis exécuter le moteur 0.1.14 à la première utilisation. Lire [le guide des skills](.claude/skills/README.md) avant d'autoriser cette étape.
- Web Design Guidelines utilise WebFetch et des règles distantes actualisées à chaque revue.
- UI UX Pro Max utilise Python 3 et ses fichiers locaux ; aucun paquet n'a été installé.
- Find Skills sert d'abord à rechercher. Toute nouvelle installation ou mise à jour demande un accord explicite sur la source, la version et la destination ; aucune installation globale automatique.
- Aucun hook, secret, réglage d'accès, workflow ou code applicatif n'est ajouté par ce lot. Ne pas fusionner dans main ni déployer comme effet de l'installation des skills.

Les deux manifestes `.claude/skills/*sources.lock.json` conservent les commits et empreintes de 147 fichiers amont. Deux SKILL.md ont des adaptations documentées : chemins UI UX Pro Max pour les skills de projet et garde-fou Find Skills. Leurs originaux sont conservés. Les licences et notices sont incluses.

Les fichiers existants du dépôt, dont README.md, AGENTS.md, CLAUDE.md et les réglages éventuels, doivent rester inchangés. Si l'état du dépôt diffère de la base examinée `6bb87b705298dbed8ae0aff4a521e69336e462ec`, vérifier les conflits avant de publier.
