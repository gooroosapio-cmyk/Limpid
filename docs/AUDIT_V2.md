# Audit du dépôt face au cahier « Cerveau de Limpid V2 » (4 octobre 2026)

Lot A du cahier : état réel du dépôt après les phases 1 à 5, avant toute modification V2.

Légende :
- **Existant** : présent et testé (tests automatiques ou essai réel).
- **Partiel** : présent, mais incomplet par rapport au cahier.
- **Manquant** : absent du dépôt.
- **Non vérifié** : présent dans le code, mais jamais exécuté contre la vraie base ou en production.

## P0 — bloque la mise en production

| Directive | État | Constat (fichiers) |
|---|---|---|
| Connexion email + mot de passe, comptes existants conservés | **Manquant → traité au lot A** | Seul le lien magique existait (`src/app/connexion`). |
| Moteur inspecté avant modification | **Existant** | Routes `src/app/api/*`, tâches `src/lib/jobs/worker.ts`, prompts `src/lib/engine/pipeline.ts`, stockage `src/lib/sources/uploads.ts`. |
| Citations : le passage existe ET soutient l'affirmation | **Partiel** | L'existence est vérifiée : le serveur localise chaque citation mot pour mot (`engine/quotes.ts`) et calcule lui-même les offsets. L'appui sémantique n'est vérifié que par le statut déclaré par le modèle (`support_status`) et par les contrôles de nombres (`contracts/validate.ts`). Il n'y a pas de vérification indépendante « l'extrait soutient-il l'énoncé ». |
| Budget borné côté serveur | **Partiel** | Coupe-circuit mensuel et quotidien vérifié avant chaque étape (`jobs/budget-guard.ts`), journal sans double débit, idempotence par clé. Il n'y a pas de réservation du coût maximal *avant chaque appel* ni de libération de la différence ensuite : le coût est enregistré après l'appel. |
| Fuite documentaire / accès croisé | **Existant (SQL), non vérifié (prod)** | RLS sur 16 tables, propriétaire forcé par trigger, recette SQL à deux comptes en CI (`supabase/tests/rls.test.sql`). Les routes serveur contrôlent `owner_id`. Aucun test inter-comptes n'a été fait contre la base de production. |

## P1 — rend le parcours réellement utile

| Directive | État | Constat |
|---|---|---|
| Cartographier tout le document avant la rédaction | **Partiel** | Tout le texte (jusqu'à 300 000 caractères) est envoyé en un seul appel de compréhension. Il n'y a ni carte des sections, ni synthèse hiérarchique, ni segments de 1 200 jetons avec chevauchement. |
| PDF déterministe, même JSON que le web | **Existant** | `render/pdf.tsx`, mêmes numéros de sources (`render/sources.ts`), texte sélectionnable (relu par l'extracteur en test). |
| Réglages essentiels visibles, options secondaires repliées | **Partiel** | Créer : style d'explication et longueur visibles. Il manque les champs présentation, illustrations et template, ainsi que le repli « Options ». |
| Diagnostic page par page (texte / scan / mixte / figure) | **Partiel** | Les pages sans texte sont signalées et les PDF scannés passent par l'OCR. Il n'y a ni classement par page, ni boîtes englobantes, ni légendes. |
| Vision sélective (pages ou régions utiles seulement) | **Manquant** | L'OCR lit toutes les pages (30 au plus), pas une sélection. |
| Écran « Vérifier la source » avant la réservation | **Manquant** | L'accord est demandé pour l'OCR, mais il n'y a pas d'aperçu des pages lues avant le lancement. |
| Cinq niveaux, quatre templates | **Existant** | Les niveaux et templates sont dans `contracts/schemas.ts`. Le template est choisi par le modèle et contraint par le schéma, sans séquence de blocs imposée par template. |
| Statut « contradicted », « partial » | **Partiel** | Statuts présents : `supported` / `ambiguous` / `unsupported`. Les contradictions sont gérées comme des objets séparés. |
| Régénération ciblée d'une section avec coût annoncé | **Partiel** | « Plus simple » et « Un autre exemple » régénèrent tout le rapport, sans coût annoncé. |

## P2 — optimisation après mesure

| Directive | État | Constat |
|---|---|---|
| Coût et latence par étape | **Partiel** | Jetons, durée et coût estimé sont enregistrés pour chaque appel (`usage_ledger`) et la dépense est affichée par étape dans `/admin`. Il n'y a ni p50/p95 ni corpus de mesure. |
| Caches applicatifs (extraction, preuves, rendu) | **Partiel** | L'extraction et la connaissance sont réutilisées par les nouvelles versions. Il n'y a pas de cache de rendu PDF, ni de cache applicatif par hash de source. |

## Architecture et contrats

| Directive | État | Constat |
|---|---|---|
| Worker externe au cycle HTTP | **Partiel** | Le worker tourne dans la fonction Vercel après la réponse (`after()`, 300 s), avec bail, heartbeat, remise en file et cron quotidien de secours. Il n'y a pas de worker dédié hors Vercel. |
| États queued/running/succeeded/failed/cancelled, checkpoints | **Existant** | `jobs/state.ts` + trigger SQL ; le checkpoint OCR permet la reprise. Pas d'état `needs_input` : `awaiting_confirmation` existe mais n'est pas utilisé. |
| Jeton de génération (une ancienne tâche ne remplace pas une version récente) | **Partiel** | Écriture refusée après suppression (trigger). Pas de `generation_epoch` entre deux versions concurrentes : un seul job actif par rapport est imposé à la demande. |
| report_status / pdf_status séparés | **Partiel** | Le PDF est rendu à la demande ; un échec n'affecte pas le rapport. Pas de statut PDF persistant. |
| Objets versionnés (SourceVersion, Evidence, KnowledgeObject, ReportVersion, UsageEvent, AuditEvent) | **Existant** | Migrations `supabase/migrations/*`. Il manque `VisualAsset` et `Policy`. |
| Adaptateur testable (inspectCapabilities, countInput, uploadSource, generateIllustration, deleteProviderArtifacts) | **Partiel** | `generateStructured` (avec fichiers joints) et la détection du quota sont faits. Le reste manque : pas de countTokens, pas de Files API (envoi inline, 14 Mo au plus), pas de génération d'image. |
| Configuration : TEXT_MODEL_ID / IMAGE_MODEL_ID | **Partiel** | `LIMPID_MODEL_FAST` / `LIMPID_MODEL_QUALITY` existent. Pas de modèle image. |

## Quotas et coûts

| Directive | État | Constat |
|---|---|---|
| Crédits utilisateur (10 rapports/mois, 1 crédit pour 5–7 pages, 2 pour 12) | **Manquant** | Seuls des plafonds en euros existent (mois, 24 h par compte, rapport). |
| Anti-abus : 3 rapports/jour, 1 job actif par compte | **Manquant → traité au lot A** | |
| Plafond global 100 USD, alertes 50/80/100 % | **Partiel** | Plafond actuel de 10 €, ajustable dans `/admin` (borné par la configuration). Il n'y a pas d'alertes. |
| Quota gratuit Gemini (20 requêtes/jour/modèle) | **Existant** | Affiché dans `/admin` ; un quota épuisé est détecté et signalé au lieu d'être retenté. |

## Sécurité et confidentialité

| Risque | État | Constat |
|---|---|---|
| Injection dans un PDF ou une image | **Existant** | Délimiteurs aléatoires et préambule ; essais réels sur image et quiz. |
| SSRF (URL) | **Existant** | `security/safe-fetch.ts` : DNS épinglé, IP privées refusées, redirections revalidées. |
| Fichier hostile, bombe ZIP | **Existant** | Signature réelle, bornes de décompression, macros refusées, dimensions d'image lues dans l'en-tête. |
| XSS / SVG | **Existant** | CSP à nonce, SVG produits par nos composants, texte échappé par React. |
| Suppression suivie d'une republication | **Existant** | Marquage `deleted_at`, puis trigger qui bloque les écritures tardives. |
| Conservation : originaux 24 h, rapports 30 jours | **Partiel** | Les originaux sont effacés dès la lecture. Les rapports sont conservés jusqu'à suppression manuelle (cadrage Q18), contre 30 jours dans le cahier : **décision à prendre**. |
| MFA administrateur | **Manquant** | Écart déjà assumé au cadrage Q8. |

## Interface (maquettes)

| Écran | État |
|---|---|
| Connexion (email, mot de passe, oublié, lien) | **Traité au lot A** |
| Créer (document + dernier rapport) | Partiel : pas de carte « Dernier rapport ». |
| Vérifier la source (pages lues, aperçu, pages peu lisibles) | Manquant |
| Votre rapport (niveau, longueur en boutons, présentation, illustrations) | Partiel |
| Votre rapport prend forme (étapes réelles) | Partiel : une seule étape affichée, pas la liste. |
| Lecteur (Aa, Plus simple, Sources, Exporter) | Partiel : pas de réglage de taille de police. |
| Source et extrait (page dédiée) | Partiel : panneau bas, pas de page dédiée. |
| Mes rapports (recherche, filtres Tous / En cours / Prêts, menu) | Partiel : liste simple. |
| Préférences / Présentation / Mon compte / Administration | Partiel : pas de choix de thème ni de quota du mois côté utilisateur. Administration faite. |

## Non vérifié en production (rappel)

Les parcours suivants n'ont jamais été vérifiés en production, faute de clé `service_role` dans la session : envoi de fichiers, OCR, quiz, nouvelles versions, administration et suppression de compte.
