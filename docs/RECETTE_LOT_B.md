# Recette du lot B — tranche complète réelle (4 octobre 2026)

Cahier V2, lot B : « PDF natif → extraction → preuves → explication Grand public → rapport web → PDF, avec un appel Gemini réel. Aucun faux résultat ni succès simulé. »

## Méthode
- **Script** : `scripts/live-slice.test.ts` (hors CI, lancé avec `LIMPID_LIVE=1`).
- **Corpus** : `scripts/corpus/eau-ville.ts`, document fictif de 4 pages (chiffres, unités, périodes, tableau, une réserve, une limite explicite), rendu en **PDF natif**.
- **Chaîne testée** : le code de l'application, sans simulation :
  - `extractSource` ;
  - `generateReport` avec Gemini réel ;
  - le composant `Reader`, rendu côté serveur, pour le web ;
  - `renderReportPdf` pour le PDF, dont le texte est ensuite relu par l'extracteur.
- **Modèle** : `gemini-3.5-flash-lite` pour les deux étapes. La production utilise `gemini-3.5-flash`, dont le quota gratuit du jour était épuisé. Chaque modèle a son propre quota, donc cette recette n'a pas entamé celui du site.
- **Exemples** : `docs/recette/lot-b/` contient le PDF source, le rapport PDF produit et les mesures.

## Écarts trouvés et corrigés
1. **Réponse hors schéma fatale.** Une réponse de `flash-lite` ne respectait pas le schéma JSON, et le rapport échouait immédiatement.
   - Correction : l'adaptateur renvoie la liste des écarts (chemin et règle, jamais le contenu) et le modèle est relancé avec cette liste, 2 fois au plus.
   - Tests : `engine.test.ts`.
2. **Réserve et limite perdues.** Le premier rapport, pourtant « validé » (toutes ses citations étaient exactes), omettait la réserve « les mesures de 2025 sous-estiment légèrement les pertes » et la limite « le bilan ne traite pas de la qualité sanitaire ». Couverture des idées essentielles : 6/8. Correction par deux contrôles déterministes (`engine/coverage.ts`), sans appel IA supplémentaire hors correction :
   - **compréhension** : toute phrase de la source portant une réserve, une exception ou une limite doit être recouverte par une preuve. Sinon, une demande de correction ciblée est faite (une fois) ;
   - **explication** : toute affirmation porteuse d'une réserve doit apparaître dans un bloc. Sinon, même demande (une fois).
   - Ce qui reste non repris après correction est consigné en avertissement, sans bloquer le rapport.

## Résultat final (mesures réelles)

| Contrôle | Résultat |
|---|---|
| Statut | validé, aucune erreur bloquante, aucun avertissement |
| Références résolubles | oui |
| Citations retrouvées mot pour mot dans la source / le web / le PDF | 12/12 · 12/12 · 12/12 |
| Nombres des affirmations présents dans la source | 14/14 |
| Idées essentielles couvertes (production, consommation, objectif, rendement, causes, réserve, objectif 2030, limite) | **8/8** (6/8 avant correction) |
| Titre présent dans le PDF | oui |

| Étape | Appels | Durée cumulée | Jetons entrée / sortie | Coût estimé |
|---|---|---|---|---|
| Extraction (locale) | — | 0,2 s | — | 0 |
| Compréhension | 2 (dont 1 correction de couverture) | 14,4 s | 4 300 / 5 767 | 0,03 € |
| Explication | 3 (dont 1 correction de couverture) | 34,0 s | 9 145 / 6 392 | 0,04 € |
| Rendu web / PDF (local) | — | 0,02 s / 0,5 s | — | 0 |
| **Total** | **5** | **≈ 49 s** | | **≈ 0,07 €** |

Avant les corrections de couverture, le même document demandait 2 appels, en 11 s, pour environ 0,03 €. La fidélité coûte donc 3 appels de plus sur ce document. Avec l'offre gratuite (20 requêtes par jour et par modèle), cela fait **4 à 7 rapports par jour**.

## Limites de cette recette
- **Un seul document court** (4 pages) et un seul niveau (Grand public). Le cahier demande un corpus plus large : deux colonnes, scan, tableaux sur plusieurs pages, contradictions, cinq niveaux. C'est l'objet du lot E.
- **Style de `flash-lite`** : très proche du texte, avec peu d'analogies. La qualité pédagogique est à juger avec `gemini-3.5-flash`, le modèle de production.
- **Base Supabase de production non utilisée** : la clé `service_role` n'est pas utilisable depuis la session de développement. Le stockage, la file de tâches, la survie à la fermeture de l'onglet et le téléphone restent à vérifier en production.
- **Pour cette vérification** : `/admin` dispose maintenant d'un **diagnostic** (configuration, base, aller-retour dans le stockage privé, URL d'envoi signée, appel Gemini facultatif) et des **durées p50/p95 par étape et par rapport**.

## Critère final du cahier : à faire valider sur téléphone
1. `/admin` → Diagnostic (cocher l'appel Gemini) : tout doit être ✓.
2. Depuis le téléphone, créer un rapport à partir de `docs/recette/lot-b/source.pdf`, fermer l'onglet pendant la génération, rouvrir « Mes rapports » : le rapport doit être prêt ou en cours, sans avoir été relancé.
3. Ouvrir le rapport, vérifier deux sources, télécharger le PDF.
4. `/admin` → Durées observées : relever la durée réelle du rapport.
