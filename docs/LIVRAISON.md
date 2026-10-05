# Livraison — cahier « Le cerveau de Limpid » V2, lot E (4 octobre 2026)

Ce document distingue ce qui est **terminé** (fait et vérifié), **partiel** (fait en partie, ou vérifié hors production) et **non testé**. Il rassemble la recette réelle, les usages de production, les migrations, la configuration (sans secret), les versions des consignes et des schémas, les captures mobiles et les exemples PDF.

## Synthèse

- **Le critère final du cahier n'est pas encore atteint** : aucune génération n'a encore abouti en production. Les deux tâches lancées le 4 octobre ont échoué sur `provider_quota_exhausted` (quota gratuit du jour de `gemini-3.5-flash` épuisé). Le reste du parcours (connexion, source, réglages, suivi, lecteur, PDF) fonctionne et a été vérifié.
- Correctif livré : **modèles de repli déclarés** (`LIMPID_MODEL_FALLBACKS`), utilisés quand le modèle principal a épuisé son quota ou est surchargé. Le modèle réellement utilisé est journalisé à chaque appel (aucun changement silencieux).
- Recette réelle du corpus : les quatre seuils de lancement sont atteints sur le corpus (après trois correctifs de fidélité trouvés par la recette). Les modèles gratuits ont montré des réponses hors schéma intermittentes et des surcharges.

## Terminé

| Domaine | Ce qui est fait et vérifié | Preuve |
|---|---|---|
| Authentification | Mot de passe + lien magique, récupération, limites d'essais | Tests, axe ; écran de connexion en production (capture 01) |
| Isolation des comptes | RLS sur toutes les tables, propriétaire forcé, écriture refusée après suppression | Recette SQL en CI ; **production** : un compte inconnu ne voit aucune ligne sur 12 tables ; le seul compte réel voit exactement ses lignes (transaction annulée, aucun contenu lu) |
| Double clic, reprise | Clé d'idempotence unique, une seule réservation de tâche, reprise d'un bail expiré, pas de double débit d'une même tentative | Recette SQL (Postgres 16) |
| Extraction | PDF natif, DOCX, TXT, lien (SSRF), image et PDF scanné (OCR avec accord), **PDF sur deux colonnes (ordre reconstruit)** sans casser les tableaux | Tests ; corpus « deux-colonnes » (page 1 reconnue, ordre correct) |
| Fidélité | Citations localisées par le serveur, nombres contrôlés, vérification indépendante, statuts `partial`/`contradicted`, couverture des réserves **et des chiffres** | Tests ; corpus : références 100 %, citations exactes 100 %, nombres 100 % |
| Injection | Délimiteurs aléatoires, consignes non suivies | Corpus « injection » : aucun lien ni affirmation injectés, rapport en français ; OCR d'image piégée (lot 4) |
| XSS | Texte échappé, aucun script ni attribut d'événement, liens http(s) seulement (web et PDF) | Test sur contenu hostile (analyse DOM) |
| Pannes | Fournisseur indisponible : version précédente intacte ; image en échec : repli sans image ; image illisible : PDF produit sans elle | Tests |
| Rendu | Web et PDF depuis le même JSON, trois présentations, schémas validés, illustrations Commons créditées | Tests ; exemples PDF lots B et D |
| Mobile | Aucun débordement à 360 et 390 px ; accessibilité axe ; suivi « Votre rapport prend forme » avec les étapes réelles | 11 écrans (captures), 0 violation reproductible (une alerte de taille de cible sur la connexion en production, non reproduite en 3 essais) |

## Partiel

- **Couverture globale des longs documents** (carte par morceaux) et **vision sélective** : non faites (coût en appels sur l'offre gratuite).
- **Quotas produit** (crédits mensuels, 100 USD) : plafonds en euros et limites anti-abus seulement ; décision en attente.
- **Conservation 30 jours** : décidée et appliquée (rapports effacés 30 jours après leur création par le cron quotidien, date affichée dans le lecteur, durée visible dans le diagnostic). Purge non encore observée en production (aucun rapport n'a 30 jours).
- **Unsplash** et **Gemini Image** : prêts, coupés. Gemini Image : quota gratuit à **0** constaté pour `gemini-3.1-flash-lite-image` (appel de vérification du 4 octobre) → offre payante obligatoire.
- **Revue humaine** de la clarté et de la fidélité (exigée par le cahier) : à faire sur les exemples PDF.
- **Comparaison NotebookLM** : non faite (le cahier exige mêmes sources, consignes et évaluateurs).

## Non testé

- Génération complète **en production depuis un téléphone**, fermeture d'onglet, export PDF d'un rapport réel (procédure ci-dessous).
- Illustration stockée servie en production ; réécriture d'une section en production.
- Suppression de compte et actions admin contre la base de production.

## Corpus de recette (Gemini réel, offre gratuite)

Script : `scripts/live-corpus.test.ts` ; corpus : `scripts/corpus/` (documents fictifs) ; résultats : `docs/recette/lot-e/corpus.json` et un PDF par document. Le modèle de production (`gemini-3.5-flash`) n'a pas pu servir à la recette (quota du jour épuisé) : les passages ont utilisé des modèles gratuits voisins, avec le repli déclaré. Tableau : dernier passage de chaque document sur le code final.

| Document (scénario) | Statut | Citations exactes (source / PDF) | Nombres | Idées essentielles | Particularités | Durée |
|---|---|---|---|---|---|---|
| PDF natif, tableau, unités, réserve | validé | 13/13 / 13/13 | 21/21 | **8/8** | graphique 75,6 % → 79,5 % | 88 s |
| Contradiction et source courte | validé | 3/3 / 3/3 | 2/2 | **4/4** | contradiction relevée, 2 sections (aucune page ajoutée) | 9 s |
| Injection dans le document | validé | 3/3 / 3/3 | 3/3 | **3/3** | aucun lien, aucune affirmation injectée, rapport en français | 15 s |
| PDF sur deux colonnes (flux mélangé) | validé | 9/9 / 9/9 | 3/3 | **5/5** | ordre reconstruit (page 1) | 149 s (503 puis repli) |

**Seuils de lancement du cahier** : références résolubles 100 % ✓ ; zéro erreur de chiffre ou d'appui (29/29 nombres, 28/28 citations) ✓ ; idées essentielles 20/20 (≥ 95 %) ✓ ; zéro défaut de rendu bloquant (PDF relus, 0 violation axe) ✓.

**Écarts trouvés par la recette et corrigés** :
- Chiffres cités mais absents du texte (« Le rendement a progressé » au lieu de « 75,6 % → 79,5 % ») : contrôle déterministe des nombres de chaque bloc, une demande de correction.
- Phrases chiffrées de la source non reprises en preuve : contrôle de couverture des chiffres (comme pour les réserves).
- Limite de portée non repérée (« ces règles valent pour… ») : marques de limite élargies.
- Avant correctifs : 6/8 et 4/5 idées essentielles.

**Cinq niveaux** (sujet « compostage », même connaissance, une rédaction par niveau, `gemini-3.6-flash` avec repli) : 4 niveaux validés sur 5, chacun 5/5 idées essentielles, 4 versions distinctes (pas de contenu figé), analogies toujours accompagnées de leur limite quand il y en a. Le niveau « étudiant » a échoué une fois en « réponse hors schéma ». La longueur moyenne des phrases ne suffit pas à juger le niveau : une **revue humaine** reste nécessaire.

**Incidents de fournisseur (offre gratuite)** : réponses « hors schéma » intermittentes (2 passages sur 4 pour le PDF natif), HTTP 503 répétés sur `gemini-3.7-flash` et `gemini-3.8-flash`, quotas journaliers vite atteints. Le repli déclaré a permis de terminer.

**Performance mesurée** (non garantie) : rapport court de 9 à 25 s sur modèles « lite » ; 88 à 168 s sur modèles Flash surchargés (attentes et reprises comprises) ; PDF depuis le JSON validé : moins de 1 s ; précontrôle d'un PDF texte : moins de 1 s. L'objectif « rapport standard < 120 s au p95 » n'est tenu qu'en l'absence de surcharge du fournisseur.

## Usages réels en production (agrégats, sans contenu)

| Mesure | Valeur |
|---|---|
| Rapports / sources | 2 / 2 (un seul compte) |
| Tâches | 2 `generate_report`, toutes deux `failed / provider_quota_exhausted` |
| Appels Gemini | 4 compréhension (2 réglés, ~17,5 s p50 ; 2 refusés pour quota), 2 explication refusés pour quota |
| Coût estimé total | 3 centimes |
| Présentation des rapports | Éditorial, visuels auto |

## Migrations (toutes appliquées en production)

1. `20261004000000_init.sql` — tables, RLS, états des tâches, réservation, stockage privé.
2. `20261004010000_revoke_definer_rpc.sql` — droits des fonctions privilégiées.
3. `20261004020000_scoped_ids.sql` — identifiants de preuves par source.
4. `20261004030000_auth_attempts.sql` — limites d'essais de connexion.
5. `20261004040000_themes_visual_assets.sql` — présentations, visuels, `visual_assets`, étape « illustrations ».

### Refonte V3 (5 octobre 2026)
- `20261005000000_v3_themes_originals.sql` — cinq thèmes du kit (null = automatique), conversion des anciens thèmes, conservation de l'original 30 jours. **À appliquer à la fusion de la refonte.**
- `20261005010000_report_quizzes.sql` — tests « Me tester » gardés par version (RLS : lecture propriétaire, écriture serveur). **À appliquer à la fusion.**

### Refonte V4 (5 octobre 2026)
- `20261006000000_v4_reader_library.sql` — 1 à 18 pages, approche par version et par rapport, approche par défaut et langue des explications, **dossiers** (supprimer un dossier garde ses rapports), **progression et lu / non lu**, **tentatives de quiz conservées**, exercices pré-générés, recherches récentes, offre du compte (filigrane). Ajouts uniquement. **À appliquer à la fusion.**

## Configuration (sans secret)

Référence complète et commentée : `.env.example`. Secrets à définir uniquement dans Vercel : `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `UNSPLASH_ACCESS_KEY` (facultatif).

- Modèles : `LIMPID_MODEL_FAST`, `LIMPID_MODEL_QUALITY`, **`LIMPID_MODEL_FALLBACKS`**, `LIMPID_IMAGE_MODEL` ; rôles V4 **`AI_REPORT_MODEL`** (rapports, exercices) et **`AI_CHAT_MODEL`** (Discuter, corrections), prioritaires quand définis.
- Contrôles : `LIMPID_VERIFY_CLAIMS`, limites de fichiers, d'OCR et de texte.
- Budgets et limites : `LIMPID_MONTHLY_CAP_CENTS`, `LIMPID_REPORT_CAP_CENTS`, `LIMPID_ACCOUNT_DAILY_CAP_CENTS`, `LIMPID_GENERATED_IMAGES_PER_MONTH` (plafonds de rapports : par offre, `src/lib/billing/catalog.ts`).
- Illustrations : `LIMPID_ILLUSTRATIONS_COMMONS` (actif), `LIMPID_ILLUSTRATIONS_UNSPLASH`, `LIMPID_ILLUSTRATIONS_GEMINI` (coupés).

## Versions

- Consignes : `PROMPT_VERSION = 2026-10-05.1` (V4 : approches, pages, exercices, variantes) (`src/lib/engine/pipeline.ts`), enregistrée avec chaque version de rapport et chaque objet de connaissance.
- Schémas : `SCHEMA_VERSION = 1.1.0` (compatible 1.0.0) (`src/lib/contracts/schemas.ts`), schémas Zod stricts (listes bornées, énumérations fermées, champs inconnus refusés).
- Modèle de production configuré : `gemini-3.5-flash`. Modèles disponibles constatés le 4 octobre : `gemini-3.6-flash`, `gemini-3.7-flash`, `gemini-3.8-flash`, `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite` ; `gemini-2.5-*` n'est plus servi aux nouveaux comptes.

## Captures mobiles (390 px) — `docs/recette/lot-e/captures/`

01 Connexion (production) · 02 Créer · 03 Vérifier la source · 04 Votre rapport · 05 Votre rapport prend forme · 06 Lecteur (production, démonstration) · 07 Schéma · 08 Source et extrait (production) · 09 Présentation · 10 Lecteur Visuel · 11 Lecteur Essentiel. Les écrans connectés sont rendus avec les vrais composants et des données de démonstration.

## Exemples PDF

`docs/recette/lot-b/rapport.pdf`, `docs/recette/lot-d/rapport-{editorial,essentiel,visuel}.pdf`, `docs/recette/lot-e/*.pdf` (corpus).

## Critère final : procédure sur téléphone

1. Dans Vercel, définir `LIMPID_MODEL_FALLBACKS` (par ex. `gemini-3.6-flash,gemini-3.1-flash-lite`) et redéployer ; ou attendre la remise à zéro du quota (9 h, heure de Paris).
2. `/admin` → Diagnostic (cocher l'appel Gemini) : tout doit être ✓.
3. Depuis le téléphone : créer un rapport à partir de `docs/recette/lot-b/source.pdf`, fermer l'onglet pendant la préparation, rouvrir « Mes rapports » : le rapport doit être prêt ou en cours, sans relance.
4. Ouvrir le rapport, vérifier deux sources, changer de présentation, réécrire une section, télécharger le PDF.
5. `/admin` → Durées observées : relever la durée réelle.

## Décisions à prendre

1. Modèle de production et repli : garder `gemini-3.5-flash` avec repli, ou passer à un Flash plus récent après benchmark.
2. Passage à l'offre payante Gemini (prévu « à la fin ») : lève les quotas de 20 requêtes/jour et permet Gemini Image.
3. Quotas produit (crédits, plafond 100 USD).
4. Unsplash (clé gratuite) : activer ou non.
