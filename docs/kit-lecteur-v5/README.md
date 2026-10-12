# Limpid - Lecteur pédagogique V5 pour Opus 5.5

Commencer par 00_DOCUMENTATION/PROMPT_OPUS_5_5.txt, puis le référentiel Markdown ou PDF. Le nouveau kit complète la marque et les assets V4 existants.

- 00_DOCUMENTATION : directives finales et décisions.
- 01_DESIGN : palette, variables et comportements.
- 02_ICONS : 26 pictogrammes pleins arrondis et sprite.
- 03_COMPONENTS : styles, contrats et structure de données.
- 04_EXAMPLES : lecteur autonome et cas entièrement fictif.
- 05_QA : contrôle des fichiers et recette à effectuer dans l’application.

Ouvrir 04_EXAMPLES/lecteur.autonome.html directement pour examiner les replis, le sommaire, les styles et le quiz. Aucun réseau ni modèle IA requis. Ce fichier est une démonstration de comportement ; les API, l’authentification et la sauvegarde réelle sont à brancher dans Limpid.

Les nouvelles icônes sont originales. Les SVG sont les assets réutilisables ; les PNG de QA et illustrations du PDF servent à la revue. Chaque SVG est monochrome et peut être coloré avec currentColor s’il est inline ou utilisé via sprite. Le CSS est limité au lecteur. Tous les textes, nombres, états et titres restent pilotés par le code.
