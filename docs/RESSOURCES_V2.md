# Limpid V2 — Ressources graphiques à fournir

Hors images des rapports et couvertures de leçons. Tant qu'un fichier n'est pas livré, l'écran affiche un dégradé de la même famille : rien n'est cassé, aucune requête vers un fichier absent.

## 1. Marque (prioritaire)

| Élément | Fichier attendu | Format | Taille / règles |
|---|---|---|---|
| Logo complet, version sombre (livre ouvert + « limpid ») | `public/brand/limpid-signature-sombre.svg` | SVG vectoriel, texte vectorisé | viewBox serré, sans marge ; couleurs #F5F4EC + #F1D94E |
| Logo complet, version claire (Papier) | `public/brand/limpid-signature-claire.svg` | SVG | encre #15180F + #F1D94E |
| Emblème seul (livre ouvert) | `public/brand/limpid-embleme.svg` | SVG | carré 24 × 24 ou 48 × 48, trait en `currentColor` si possible |
| Planche de ressources V2 (source) | `LIMPID_Ressources_V2.svg` | SVG d'origine | seule la capture PNG a été reçue ; le SVG permettra de reprendre les tracés exacts |

## 2. Icône d'application (remplace l'ancienne)

Emblème « livre ouvert » sur fond jaune #F1D94E (planche, « 03 / Emblème compact »).

| Fichier | Format | Taille |
|---|---|---|
| `public/icons/limpid-192.png` | PNG | 192 × 192 |
| `public/icons/limpid-512.png` | PNG | 512 × 512 |
| `public/icons/limpid-maskable-512.png` | PNG | 512 × 512, motif dans le cercle central de 80 % (zone sûre) |
| `public/icons/apple-touch-icon.png` | PNG | 180 × 180, fond plein (pas de transparence) |
| `src/app/icon.svg` | SVG | favicon carré |

## 3. Illustrations d'écran (décoratives)

Format commun : **WebP**, qualité ~80, **moins de 150 Ko**, fond sombre compatible #0E110F, sujet décentré vers la droite (le texte s'écrit à gauche ou en bas), aucune information indispensable dans l'image. Fournir aussi une version 2× si possible (même nom suffixé `@2x`).

| Écran | Fichier | Ratio / taille | Rendu affiché |
|---|---|---|---|
| Connexion (livre ouvert lumineux) | `public/illustrations/connexion.webp` | 2,4:1 — 1200 × 500 | 140 px de haut sur mobile |
| Bibliothèque vide (accueil sans historique) | `public/illustrations/bibliotheque-vide.webp` | 2:1 — 1200 × 600 | 180 px |
| Profil, carte « offre et crédits » | `public/illustrations/profil-offre.webp` | 2:1 — 1200 × 600 | moitié droite de la carte, fondue |
| Import, zone d'ajout (pages en mouvement) | `public/illustrations/import.webp` | 2:1 — 1200 × 600 | réservé (zone d'ajout) |
| Offres, en-tête (feuilles dorées) | `public/illustrations/offres.webp` | 3:2 — 1200 × 800 | réservé (en-tête des offres) |

Activation : ajouter le nom dans `READY` (`src/components/Illustration.tsx`).

## 4. Partage et installation (facultatif)

| Fichier | Format | Taille |
|---|---|---|
| `public/og-limpid.jpg` (aperçu des liens partagés) | JPEG ou PNG | 1200 × 630 |
| Écrans de démarrage iOS | PNG | facultatif, 1170 × 2532 et 1290 × 2796 |

## 5. Déjà en place, rien à fournir

- Police **Inter** auto-hébergée (`public/fonts/Inter.woff2`, graisses 400 / 500 / 600 utilisées).
- Icônes d'interface (grille 24 × 24, trait 1,75, `currentColor`) : dessinées dans `src/components/Icon.tsx`.
- Logos Google et Apple des boutons de connexion : versions officielles intégrées.
- Avatars : initiales du compte (aucune photo inventée).
