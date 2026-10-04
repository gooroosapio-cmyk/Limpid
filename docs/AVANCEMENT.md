# Avancement

## Phase 3 — Fichiers, liens et export PDF (4 octobre 2026)

Configuration Vercel / Supabase faite par le propriétaire (variables, URL de redirection, liste blanche). Gemini reste sur l'offre gratuite jusqu'à la fin de l'alpha (décision du propriétaire).

### FAIT
- **Fichiers PDF (texte), DOCX et TXT.** Le navigateur envoie le fichier directement dans le bucket privé `sources` par une URL signée à usage unique (les fonctions Vercel refusent les corps de plus de 4,5 Mo), avec barre de progression. Le serveur relit le fichier, contrôle sa signature réelle contre l'extension, l'analyse, puis **efface l'original aussitôt** (cadrage Q18). Un fichier refusé ou illisible ne laisse rien en base.
- **PDF** : texte page par page (pdf.js via unpdf, sans XFA ni polices), césures recollées, localisation par page (avec numéro imprimé quand il diffère). PDF sans couche texte → message clair (« scanné, OCR bientôt »), PDF protégé → message clair. Pages sans texte et pages au-delà de 100 signalées dans la couverture.
- **DOCX** : archive lue en flux avec bornes (2 000 entrées, 40 Mo décompressés : pas de bombe ZIP), documents à macros refusés, paragraphes et styles de titre (toutes langues) repris comme intertitres ; texte supprimé en révision et codes de champ ignorés.
- **Lien** : téléchargement avec la protection SSRF existante (DNS épinglé, IP privées refusées, redirections revalidées), pages HTML, texte et PDF en ligne. Zone principale (`article`, `main`…) puis Readability en repli ; menus, notes et encadrés retirés ; tableaux lus ligne par ligne, listes regroupées. Jeu de caractères respecté. Désactivable (`LIMPID_URL_IMPORT=off`).
- **Couverture** : au-delà de 300 000 caractères ou 100 pages, le document est tronqué proprement et le rapport l'affiche (« ce rapport ne couvre qu'une partie du document »).
- **Export PDF** : bouton « Télécharger le PDF » actif. Rendu serveur déterministe (aucun appel IA), police Inter intégrée, mêmes numéros de sources que le lecteur, schéma de flux et sa version texte, pied de page avec pagination. Disponible aussi pour la démonstration.
- **Purge** : le cron quotidien efface aussi les envois abandonnés (3 h après leur préparation), et chaque nouvel envoi déclenche un petit ménage.
- Formulaire « Créer » : onglets Fichier (par défaut), Lien et Texte actifs ; mention de l'envoi du texte à Gemini.

### EN TEST (résultats réels)
- `npm test` : 96 tests (dont 15 d'extraction sur des PDF et DOCX fabriqués : pages vides, limite de pages, troncature, PDF scanné ou endommagé, macros, bombe ZIP de 41 Mo, archive non Word ; 2 d'export PDF relu par l'extracteur). Typecheck et build OK.
- Page Wikipédia réelle (« Cycle de l'eau ») : 63 segments avec intertitres, tableau des réservoirs lu ligne par ligne, liste des langues et notes écartées. PDF en ligne sans texte → refus « scanné ». Adresse 169.254.169.254 → refusée.
- Serveur de production local : PDF de démonstration téléchargé (200, `application/pdf`, nom de fichier propre) ; export et envoi sans session → 401. Polices bien jointes à la fonction (trace Next).
- Chromium 360 px : onglets Fichier / Lien, fichier choisi, aucun débordement horizontal ; téléchargement du PDF depuis le lecteur.
- Bucket `sources` vérifié dans le projet Supabase (privé, 20 Mo).

### NON TESTÉ
- Envoi réel vers Supabase Storage et parcours complet connecté (fichier → rapport → PDF) : la clé `service_role` n'est pas utilisable depuis cette session. À vérifier sur l'URL Vercel.

### PROCHAINE ÉTAPE — Phase 4
OCR des images et PDF scannés par la vision Gemini (avec avertissement avant envoi), actions « Plus simple » / « Un autre exemple » et quiz de compréhension corrigé.

### BLOCAGE
- Aucun. Rappel : offre gratuite Gemini = données potentiellement utilisées par Google ; à éviter pour des documents sensibles.

## Phase 2b — Parcours dans l'application (4 octobre 2026)

### FAIT
- Liste blanche : `gooroosapio@gmail.com` (admin) dans `allowed_emails` du projet Supabase.
- Connexion par lien magique (`/connexion`, `/auth/callback`, `/auth/deconnexion`) ; réponse identique pour une adresse non autorisée ; pages privées redirigées vers la connexion ; session rafraîchie dans le proxy sans toucher à la CSP.
- Création depuis un texte collé (`POST /api/reports`) : source, segments, rapport et tâche idempotente ; le worker démarre juste après la réponse (`after()`, 300 s max) ; cron quotidien `/api/worker` (protégé par `CRON_SECRET`) en filet de sécurité.
- Worker : réservation `claim_job`, étapes et heartbeat visibles, coupe-circuit (global mensuel et par compte sur 24 h), journal de consommation sans double débit, enregistrement connaissance / preuves / version, statut « vérification incomplète » si les contrôles échouent, annulation honorée.
- Lecteur branché sur les vrais rapports (lectures via RLS, revalidation Zod à l'affichage), suivi de progression, suppression complète (rapport, source, segments, preuves, versions, fichiers) avec compte rendu et journal d'audit.
- Préférences enregistrées, rechargées, effaçables ; niveau par défaut déduit de la familiarité.
- Migration `scoped_ids` : clés des segments et preuves propres à chaque source / objet de connaissance (évite les collisions `seg_1`, `ev_1` entre rapports).

### EN TEST (résultats réels)
- `npm test` 74 tests, typecheck et build OK ; recette SQL locale OK après la migration.
- Serveur de production local : pages privées → 307 vers `/connexion` ; API sans session → 401 ; cron sans secret → 401 ; Chromium 360 et 1440 px : connexion avec adresse non autorisée → message générique, aucune erreur console ni CSP, aucun débordement.

### NON TESTÉ
- Parcours complet connecté (création → génération → lecture → suppression) : la clé `service_role` n'est pas visible dans cette session (elle ne sera lue que par une nouvelle session).

### BLOCAGE / À FAIRE CÔTÉ PROPRIÉTAIRE
- Vercel : `GEMINI_API_KEY`, `LIMPID_MODEL_FAST=gemini-3.5-flash`, `LIMPID_MODEL_QUALITY=gemini-3.5-flash`, `CRON_SECRET`, `LIMPID_SITE_URL`.
- Supabase → Authentication → URL Configuration : Site URL = URL Vercel, et `https://<domaine>/auth/callback` dans les Redirect URLs.

## Phase 2a — Données vérifiées et moteur réel (4 octobre 2026)

### Vérification des accès
| Élément | État |
|---------|------|
| Gemini | Accessible. `gemini-3.5-flash` et `gemini-3.5-flash-lite` répondent ; modèles Pro à quota nul (offre gratuite probable : conditions d'usage des données à vérifier avant tout document privé) ; ~5 requêtes/min. |
| Supabase | Projet « Limpid » (eu-west-1) trouvé vide ; migrations appliquées. |
| Clé `service_role` | Absente de l'environnement : routes serveur et worker non testables en réel. |
| Liste blanche | `allowed_emails` vide : aucune connexion possible tant que l'adresse du propriétaire n'y est pas. |
| Vercel | Non configuré. |
| Payloads 1 et 2, PDF UI/UX | Absents du dépôt ; seules leurs décisions résumées dans `CADRAGE.md` et le code de la phase 1 en tiennent lieu. |

### FAIT
- Extraction texte collé / TXT : normalisation figée, segments hachés, titres rattachés, paragraphes longs découpés sans perte.
- Moteur : compréhension → explication → mise en page déterministe. Le modèle cite, le serveur localise la citation et calcule les offsets (tolérance typographique, tranche réelle conservée). Jusqu'à deux réparations guidées par les erreurs du validateur, sinon statut « incomplet ». Erreurs passagères (503, 429) retentées avec attente.
- Schéma de flux produit uniquement à partir d'affirmations « supported ».
- Adaptateur Gemini : l'API refuse (400) les schémas portant de nombreuses bornes de taille ; elles sont retirées du schéma envoyé et restent imposées par Zod.
- Supabase : `search_path` figé sur les fonctions trigger ; exécution RPC révoquée sur `force_owner`, `handle_new_user`, `is_admin`.

### EN TEST (résultats réels)
- Génération réelle (`scripts/live-engine.test.ts`, texte d'essai sur la photosynthèse) : rapport **validé sans réparation**, 9 affirmations sourcées, 9 preuves localisées, 5 sections, 1 schéma de flux ; ~33 s, ~2 800 jetons en entrée et ~3 500 en sortie.
- `npm test` : 74 tests (moteur avec fournisseur simulé : réparation, échec après deux réparations, schéma non sourcé écarté, erreur non retentée).
- Supabase réel : 16 tables sous RLS, buckets privés `sources` et `exports` ; avec la clé publique, lecture des tables vide et `claim_job` / `is_admin` refusés.
- Conseiller de sécurité Supabase : restent l'information « RLS sans policy » (voulu : tables serveur uniquement) et `rls_auto_enable` (fonction créée par Supabase, hors de notre migration).

### PROCHAINE ÉTAPE — Phase 2b : parcours dans l'application
Connexion par lien magique, route « créer depuis un texte collé » (source, segments, tâche idempotente), worker qui exécute le pipeline et enregistre connaissance / version / consommation, lecteur branché sur un vrai rapport, suppression complète.

### BLOCAGE
- `SUPABASE_SERVICE_ROLE_KEY` à ajouter dans l'environnement de la session (et dans Vercel).
- Adresse du propriétaire à insérer dans `allowed_emails` (rôle `admin`).
- Décision : passer la clé Gemini en offre payante avant d'y envoyer des documents privés.

## Phase 1 — Contrats, sécurité et socle (4 octobre 2026)

### FAIT
- Projet Next.js 16 + TypeScript strict, CSP avec nonce par requête et en-têtes de sécurité (`src/proxy.ts`).
- Contrats Zod versionnés du payload 2 (SourceSegment, Evidence, KnowledgeObject, Claim, ExplanationObject, blocs typés, ComprehensionCheck, ReportBlueprint, VisualSpec, ValidationResult), stricts.
- Contrôles sémantiques : références résolues, citation = texte source aux offsets indiqués, nombres présents dans les preuves, affirmation non soutenue interdite dans un bloc factuel, relations orphelines, doublons.
- Protection SSRF : HTTP(S), sans identifiants, ports 80/443, IPv4/IPv6 privées et réservées bloquées, toutes les IP DNS contrôlées, connexion épinglée sur l'IP validée, redirections revalidées, taille et délai bornés.
- Contrôle des fichiers par signature réelle, cohérence extension/MIME.
- Schéma Supabase : 15 tables, RLS partout, propriétaire forcé côté serveur, liste blanche d'inscription, idempotence des jobs, réservation `FOR UPDATE SKIP LOCKED` avec bail, transitions contrôlées en SQL, blocage des écritures après suppression, budget sans double débit.
- Adaptateur Gemini derrière `AIProvider` : données non fiables délimitées, validation serveur systématique, erreurs explicites (refus, vide, tronqué, hors schéma, délai ambigu…).
- Interface mobile first : Créer (onglets Fichier/Lien/Texte), Mes rapports (démonstrations séparées), QCM de préférences (6 écrans, Retour/Passer/progression), lecteur avec sources en panneau bas, schéma de flux SVG et version texte.
- CI GitHub Actions : typecheck, tests, build, recette SQL sur Postgres 16.

### EN TEST (résultats réels)
- `npm test` : 62 tests passent (contrats, SSRF, fichiers, états, préférences).
- Recette SQL sur Postgres 16 local avec une imitation de l'environnement Supabase : isolation entre deux comptes, inscription refusée hors liste, propriétaire usurpé ignoré, double lancement refusé, sortie d'état terminal refusée, `claim_job` inaccessible au client, écriture tardive refusée après suppression — OK.
- Rendu Playwright 360 / 390 / 768 / 1440 px : aucun débordement horizontal, aucune erreur console ni violation CSP ; panneau des sources ouvert puis focus rendu au bouton d'origine.

### NON TESTÉ / LIMITES
- Adaptateur Gemini : jamais appelé (pas de clé). Génération réelle = non testée.
- Migration jamais appliquée sur un vrai projet Supabase (auth et storage réels).
- Import, connexion et enregistrement des préférences : interface présente, envoi désactivé et signalé à l'écran.
- Pas d'antivirus (cadrage Q19) ; admin sans 2FA (cadrage Q8) — à revoir avant tout invité.
- Audit WCAG complet non réalisé (contrôles faits : cibles, focus, libellés, clavier sur les onglets).

### PROCHAINE ÉTAPE — Phase 2 : parcours réel
Connexion par lien magique, upload privé, extraction PDF texte / TXT / texte collé avec aperçu et couverture, création de rapport idempotente, worker de jobs, préférences enregistrées, suppression complète.

### BLOCAGE
- Projet Supabase (URL + clés) ou autorisation du connecteur Supabase.
- Clé Gemini + choix des modèles FAST/QUALITY.
