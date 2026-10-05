# Limpid V2.1 — Ressources graphiques à fournir

Les couvertures des leçons sont **générées par Gemini** (aucune image à fournir). Tant qu'une ressource ci-dessous n'est pas livrée, l'écran affiche un dégradé de la même famille de couleurs : rien n'est cassé.

**Format commun des images** : WebP, qualité ~80, moins de 200 Ko, ambiance sombre (fond proche de #0E110F), **aucun texte dans l'image**, sujet du côté indiqué. Fournir aussi la version 2× (même nom + `@2x`) si possible.

## A. Images des écrans (prioritaires pour coller aux maquettes)

| # | Écran / emplacement (maquette) | Nom du fichier | Taille | Sujet et cadrage |
|---|---|---|---|---|
| 1 | Connexion — grande image du haut | `connexion.webp` | 1170 × 870 | livre ouvert lumineux, rubans verts ; logo posé en haut à gauche, bas de l'image sombre |
| 2 | Import — zone « Ajouter des documents » | `import.webp` | 1170 × 520 | feuilles et pages en mouvement, centre dégagé (bouton + jaune au centre), bas sombre |
| 3 | Votre espace — carte « Découverte / crédits » | `profil-offre.webp` | 1170 × 540 | vague dorée à droite, gauche sombre (texte) |
| 4 | Offres — en-tête en haut à droite | `offres.webp` | 1170 × 1000 | pages de livre dorées en éventail, coin haut droit ; gauche/bas transparents vers le noir |
| 5 | Offres — carte « Votre offre » | `offres-actuelle.webp` | 900 × 600 | coin de livre vert sauge, à droite |
| 6 | Offres — carte « Pour aller plus loin » | `offres-plus.webp` | 900 × 800 | feuilles dorées lumineuses, à droite |
| 7 | Leçon — carte « Présentation » | `lecon-presentation.webp` | 600 × 400 | livre ouvert, à droite, gauche sombre |
| 8 | Leçon — carte « Quiz » | `lecon-quiz.webp` | 600 × 400 | empreinte de main sur roche (ou objet neutre), à droite |
| 9 | Bibliothèque vide (premier lancement) | `bibliotheque-vide.webp` | 1170 × 540 | livre ouvert / lumière douce |
| 10 | Collections (tuiles de dossiers) — facultatif | `dossier-1.webp` … `dossier-6.webp` | 600 × 300 | objets de bureau (livres, crayons…), à droite |

Emplacement : `public/illustrations/`. Activation : nom ajouté dans `READY` (`src/components/Illustration.tsx`) — je m'en charge à la réception.

## B. Marque

| Élément | Fichier | Format |
|---|---|---|
| Logo complet (livre ouvert + « limpid ») version sombre | `limpid-signature-sombre.svg` | SVG, texte vectorisé |
| Logo complet version claire | `limpid-signature-claire.svg` | SVG |
| Emblème seul (livre ouvert) | `limpid-embleme.svg` | SVG carré |
| Planche source | `LIMPID_Ressources_V2.svg` | SVG d'origine (seule la capture PNG a été reçue) |

## C. Icône d'application (emblème sur fond jaune #F1D94E)

| Fichier | Taille |
|---|---|
| `limpid-192.png` | 192 × 192 |
| `limpid-512.png` | 512 × 512 |
| `limpid-maskable-512.png` | 512 × 512, motif dans les 80 % centraux |
| `apple-touch-icon.png` | 180 × 180, fond plein |
| `icon.svg` (favicon) | SVG carré |

## D. Facultatif

| Fichier | Taille |
|---|---|
| `og-limpid.jpg` (aperçu des liens partagés) | 1200 × 630 |
| Écrans de démarrage iPhone | 1170 × 2532 et 1290 × 2796 (PNG) |

## Déjà en place

Police Inter ; icônes d'interface ; logos Google et Apple officiels ; avatars en initiales (nom affiché modifiable) ; couvertures de leçons générées par Gemini.
