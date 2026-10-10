# UI UX Pro Max : intégration Limpid

Source : `nextlevelbuilder/ui-ux-pro-max-skill`, commit `50d8a7de0900119855614541f15a1a616691eb33`, licence MIT. Le dossier `.claude/skills/ui-ux-pro-max` amont est conservé au complet, ainsi que la licence à la racine du dépôt amont. Le CLI d'installation et les autres skills du dépôt ne sont pas inclus.

## Adaptation du chemin

Le `SKILL.md` amont emploie `${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max`. Cette variable est réservée aux skills de plugins. Pour les skills de projet, la [documentation Claude Code](https://code.claude.com/docs/en/skills#available-string-substitutions) prévoit `${CLAUDE_SKILL_DIR}`.

Seuls ces 11 préfixes ont été remplacés dans le `SKILL.md` actif. L'original exact se trouve dans `references/upstream-skill.md`. Aucun script Python n'a été modifié. Les deux empreintes figurent dans le manifeste.

## Fonctionnement et limites

- La recherche exige Python 3 et utilise la bibliothèque standard, les modules locaux et les fichiers CSV/JSON fournis. L'inspection statique du parcours de recherche n'a révélé aucun appel réseau ni lancement de processus.
- Aucun script, CLI ou test amont n'a été exécuté pendant la préparation. Cela ne constitue pas une garantie de comportement ni une validation dans Claude Code web/mobile.
- Si Python manque, demander à l'utilisateur de le rendre disponible ou consulter les références textuelles. Ne pas installer un gestionnaire de paquets ou modifier le système pour ce skill sans autorisation.
- `--persist` crée les fichiers sous `design-system/` dans la destination indiquée ; `--force` remplace des fichiers existants et exige l'accord explicite de l'utilisateur. Vérifier les chemins, le contenu existant et la portée avant écriture.
- Les données proposent aussi des bibliothèques, polices et liens externes : leur mention n'autorise pas leur téléchargement, leur installation ou la transmission de données.
- Les tests sont conservés comme source. Les tests de rafraîchissement de catalogues, de pertinence, de fins de ligne et de chemins de skill supposent des outils à la racine du dépôt amont qui ne font pas partie du paquet. Ne pas annoncer que la suite complète a été exécutée ou qu'elle est autonome.
