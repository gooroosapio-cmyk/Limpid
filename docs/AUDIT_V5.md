# Audit initial — cadrage « Améliorer l'existant » (5 octobre 2026)

Chaque constat porte une étiquette : **[code]** confirmé dans le code, **[test]** reproduit par un test ou une recette locale, **[prod]** vérifié sur le site déployé, **[non vérifié]** pas encore établi. Les captures du cadrage précèdent la refonte V4, fusionnée le 5 octobre (PR #13) : plusieurs points qu'elles signalent étaient déjà corrigés.

## Déjà en place (V4, avant ce cadrage)

| Point du cadrage | État | Preuve |
|---|---|---|
| Titre « Que voulez-vous comprendre ? », Fichier / Lien / Texte, « Créer mon Limpid », « Voir mes Limpid », « Propulsé par gooroo » | Fait | [code] `src/app/ajouter`, [prod] HTML servi |
| Encadré « Vous n'avez rien à configurer », slogans empilés | Absents depuis V4 | [code] |
| Filtres Tous / Prêts / En cours / Échecs sur une ligne | Fait | [code] `src/app/page.tsx`, [test] 320–1440 px |
| Thème par défaut et cartes Sciences/Récit/… dans Paramètres | Retirés | [code] `src/app/parametres` |
| Lecteur paginé mesuré, barres, Discuter, points de contrôle, bilan, autre exemple, autre formulation | Fait | [code], [test] |
| Mentions Gemini retirées des écrans courants | Fait | [code] (restent dans Confidentialité et l'administration) |
| Filigrane des exports gratuits décidé par le serveur | Fait | [code] `api/reports/[id]/pdf` lit `profiles.plan` |
| Rôles IA rapport / discussion | Fait | [code] `AI_REPORT_MODEL`, `AI_CHAT_MODEL` |

## Constats et causes

| Zone | Constat | Cause réelle | Étiquette |
|---|---|---|---|
| Envoi des fichiers | Les octets ne passent **pas** par une fonction Vercel : `/api/uploads` délivre une URL signée et le navigateur envoie directement au stockage Supabase. La limite de 20 Mo est contrôlée trois fois (demande d'envoi, bucket `file_size_limit`, relecture serveur). La limite de 4,5 Mo des fonctions ne s'applique donc pas à l'envoi. | — | [code] ; essai > 4,5 Mo en production : [non vérifié] |
| Export PDF volumineux | Le PDF est rendu par une fonction et renvoyé dans la réponse ; la limite de 4,5 Mo vise le corps de **requête**, pas la réponse. Un rapport de 18 pages illustré pèse < 1 Mo en local. | — | [test] local |
| Césure « de-viennent » | `h1 { hyphens: auto }` dans `base.css`. | CSS | [code] |
| Libellé qui sort d'un schéma | `FlowDiagram` écrit chaque étape sur une seule ligne de texte SVG, de largeur fixe, sans mesure ni retour à la ligne. | Rendu du schéma | [code] |
| Sept opérations / quatre phases | La consigne du rédacteur demande déjà de dire explicitement un regroupement (« Si des opérations de la source sont regroupées… ») ; le schéma de flux n'en porte pas la mention. | Rendu + consigne | [code] |
| Approches | Liste verticale de 4 boutons radio, sans icône ni relief. | Composant | [code] |
| Imports multiples | Un seul fichier par Limpid ; aucun champ `multiple` ; `reports.source_id` unique ; identifiants de segments locaux à une source (`seg_N`) ; `KnowledgeObject.source_ids` limité à 1. | Modèle de données et moteur | [code] |
| OCR | Tout ou rien : un PDF dont **une** page a du texte n'est jamais lu par OCR, ses pages-images sont **ignorées** (seulement listées comme « vides »). L'OCR demande un accord explicite. La consigne OCR dit d'ignorer les figures sans texte : le sens d'un schéma est perdu. | Extraction | [code], [test] (`extract.test.ts`) |
| Cache OCR | Le texte lu est figé en segments de la source : nouvelles versions, lecture et rangement ne relancent jamais l'OCR. | — | [code] |
| Doublons | L'empreinte du texte (`content_hash`) existe ; aucune détection de doublon à l'import. | Import | [code] |
| Recherche | Validation obligatoire (Entrée), navigation serveur à chaque recherche ; le panneau ne se replie pas selon le clavier. | Composant | [code] |
| Déplacement | Un rapport à la fois ; pas de sélection multiple, pas de création de dossier dans le panneau, pas d'annulation. Le serveur vérifie bien la propriété du rapport et du dossier. | Composant + API | [code] |
| Suppression de dossier | Garde les rapports ; aucune option explicite pour les supprimer aussi. | — | [code] |
| Paramètres | Réglages pédagogiques ouverts en grandes sections à la racine. | Page | [code] |
| Annexes | Glossaire, sources et limites sont des **vues du carrousel** (comptées dans la progression) ; références en pastilles 24 px. | Lecteur | [code] |
| Administration | Pages et opérations protégées par `requireAdmin()` côté serveur (rôle en base, pas d'e-mail côté client). Pas de reprise ni d'annulation ciblée d'une tâche, pas de pages natives / OCR par traitement. | — | [code] ; refus non-admin en production : [non vérifié] |
| Limites | 3 Limpid / 24 h et 1 préparation simultanée par compte (variables d'environnement) : un lot « un Limpid par document » ne peut pas les contourner. | Offre | [code] |

## Fichier de référence Mwat Mwat

Non fourni dans cette session : la régression R07/R12 est couverte par un PDF de synthèse composé uniquement d'images, et devra être rejouée avec le fichier réel.

## Ordre retenu

1. Garde-fous : rien de destructif ; migrations par ajout ; anciens rapports à source unique inchangés (mêmes identifiants).
2. Interface : cartes 2 × 2, liste de fichiers, recherche dynamique, Préférences, annexes hors carrousel, schémas mesurés.
3. Dossiers : sélection multiple et déplacement groupé atomique.
4. Imports multiples, OCR automatique page par page, figures décrites, doublons.
5. Administration, sécurité, recette R01–R28, livraison.
