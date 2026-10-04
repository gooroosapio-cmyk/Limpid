# Limpid — Cadrage de l'alpha privée

Décisions issues du QCM de cadrage du 4 octobre 2026. Elles complètent les payloads 1 et 2 et le PDF « Limpid UI/UX mobile first » ; en cas de conflit sur ces points, ce document prime.

## Infrastructure

| # | Sujet | Décision |
|---|-------|----------|
| 1 | Code | Ce dépôt GitHub (`gooroosapio-cmyk/limpid`) |
| 2 | Données / auth / stockage | Supabase (Postgres, Auth, Storage privé) |
| 3 | Fournisseur IA actif | Google Gemini (adaptateur `AIProvider`, OpenAI désactivé et extensible) |
| 4 | Clé API | À créer : procédure guidée ; mode démo explicite en attendant |
| 5 | Hébergement / test mobile | URL déployée sur Vercel ; worker de jobs séparé |
| 6 | Connexion | Lien magique par email (Supabase Auth) |
| 7 | Utilisateurs | Propriétaire seul ; inscriptions fermées, liste blanche d'emails |
| 8 | Administration | Rôle admin côté serveur sur le compte propriétaire, **sans 2FA pour l'instant** (écart assumé au payload 1 § 6, à revoir avant toute ouverture à des invités) |

## Identité et ton

| # | Sujet | Décision |
|---|-------|----------|
| 9 | Palette | PDF : ivoire `#F7F6F2`, encre `#20211F`, jaune `#F2D94E`, vert `#396451`, gris `#61655E` |
| 10 | Logo | Livre ouvert + trait de surligneur, recréé en SVG |
| 11 | Adresse | **Vouvoiement** (les maquettes du PDF au tutoiement sont adaptées) |
| 12 | Langue | Interface en français, textes externalisés (i18n prête) ; le rapport suit la langue de la source |

## Périmètre V1

| # | Sujet | Décision |
|---|-------|----------|
| 13 | Première livraison | Tranche verticale : texte collé / PDF texte → rapport sourcé → lecteur mobile → PDF → suppression |
| 14 | Formats d'entrée | Texte collé, TXT, PDF texte, DOCX, images JPG/PNG/WEBP et PDF scannés (OCR), URL publique (désactivée si la protection SSRF n'est pas garantie sur l'hébergeur) ; PPTX hors V1 initiale |
| 15 | OCR | Vision Gemini, avec mention avant envoi que l'image part chez le fournisseur |
| 16 | Images générées | Aucune : schémas SVG issus de données validées uniquement |

## Budget, données, méthode

| # | Sujet | Décision |
|---|-------|----------|
| 17 | Plafond IA global | 10 € / mois (coupe-circuit configurable dans l'admin) |
| 18 | Conservation | Source originale purgée sous 24 h ; rapports, extraits et dérivés conservés **jusqu'à suppression manuelle** |
| 19 | Antimalware | Pas d'antivirus en alpha ; contrôles stricts (signature, bornes, rejet macros/contenu actif, aucun fichier exécuté). Limite documentée |
| 20 | Méthode | Autonomie, commits fréquents sur la branche, rapport FAIT / EN TEST / PROCHAINE ÉTAPE / BLOCAGE à chaque phase |

## Points à vérifier lors de l'intégration

- Conditions d'utilisation des données Gemini : l'offre gratuite peut autoriser l'usage des données pour améliorer les services ; l'offre payante (facturation activée) est à privilégier pour les documents privés. À confirmer sur la documentation en vigueur avant activation.
- Modèles Gemini FAST / QUALITY : identifiants configurables côté serveur, choisis d'après la documentation et un essai réel ; aucun identifiant codé en dur.
- Durées d'exécution Vercel et choix du worker (Supabase Edge Functions / cron, ou petit service dédié) : à mesurer avant de figer.
- Rendu PDF isolé (Playwright/Chromium) : faisabilité sur l'hébergement retenu à vérifier.

## Accès nécessaires (aucun secret dans le dépôt ni dans le chat)

| Variable | Où la définir | Usage |
|----------|---------------|-------|
| `GEMINI_API_KEY` | Vercel + environnement de la session Claude | Génération réelle |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + environnement | Client |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + environnement (serveur uniquement) | Worker, admin, purges |
| `OWNER_EMAIL` | Vercel | Liste blanche et rôle admin |
