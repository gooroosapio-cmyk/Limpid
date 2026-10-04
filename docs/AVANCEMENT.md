# Avancement

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
