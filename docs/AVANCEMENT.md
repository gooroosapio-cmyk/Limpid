# Avancement

## Phase 12.1 — Illustrations incrustées et pages plus denses (5 octobre 2026)

### FAIT
- **Planche de dessins vectoriels** : en **une seule génération**, le modèle propose de petits dessins simples (environ un pour deux parties, 6 au plus, 2 en résumé fidèle), chacun ancré sur le bloc dont il rend visible une notion complexe ou une observation. Le moteur valide chaque forme (repère borné, chemins restreints, **aucun fond**, étiquettes courtes sans chiffre inventé) et dessine lui-même le SVG aux couleurs du thème (clair et sombre). Jamais une preuve : légendé « Illustration ». Désactivable (`LIMPID_DRAWINGS=off`) et coupé en « texte seul ».
- **Planche d'images** (quand la génération d'images est activée) : toutes les illustrations du rapport en **une seule image**, en grille sur fond blanc ; le serveur découpe chaque case, **rend le fond transparent**, recadre et stocke des PNG prêts à incruster, sans chevauchement (`sharp`, dépendance explicite).
- **Incrustation** : dessins et images flottent dans un bloc de texte (côtés alternés), le texte les longe à hauteur du visuel (ratio respecté) puis **continue sous leur pied** ; légende sous le visuel. PDF : dessin vectoriel centré avec sa légende.
- **Pages plus denses** : deux notions peuvent partager une vue (plus de saut de vue imposé à chaque partie ; un titre reste toujours avec son premier bloc) ; consignes de rédaction contre les vides et les murs de texte (paragraphes de 2 à 4 phrases, notions minces regroupées).

### EN TEST
- 207 tests (validation des formes, ancrage, rendu SVG sans script, export PDF, planche découpée sur une vraie image avec fond transparent et recadrage, une seule génération pour toute la planche).

## Phase 12 — Refonte V4 « LIMPID » et interface en anglais (5 octobre 2026)

### FAIT
- **Moteur éditorial maison** (pas de Puck) : le document structuré (contrat 1.1.0, compatible 1.0.0) devient des **pièces** (couverture, parties, blocs, éléments de liste, formules, visuels, points de contrôle, fin, annexes). Le lecteur **mesure leurs hauteurs réelles** et compose les vues : aucune coupure, aucun `overflow: hidden`, aucune réduction de police ; une pièce plus haute que l'écran forme une vue qui défile, et un titre n'est jamais isolé.
- **4 approches** à l'import (Très simple, Explication claire présélectionnée la première fois, Résumé fidèle, Révision active ; le dernier choix explicite est retenu), **5 à 18 pages** pédagogiques, résultat court annoncé quand la source est pauvre, points clés, idée clé, listes, formules, compléments signalés.
- **Lecteur** : carrousel vertical une vue à la fois (transition 220 ms, mouvement réduit respecté), **lecture continue** en option ; en haut « × Fermer » + partie courante (Fermer rend l'état exact de la bibliothèque) ; en bas **Sommaire | progression | Options** ; bouton jaune **Discuter** dans une bande réservée (jamais sur le texte) ; le retour du téléphone ferme d'abord un panneau ; position de lecture enregistrée.
- **Options** : Exporter en PDF, Affichage, Sources, Glossaire, Créer une autre version (4 approches), versions conservées, hors connexion, suppression.
- **Points de contrôle intégrés** (1 à 3 questions, lecture → quiz → correction → reprise, carrousel suspendu, « Passer pour le moment ») et **« Tester ma compréhension »** : bilan de 5 à 25 questions, tentatives conservées, score observé distinct de la maîtrise. Types : QCM simple et multiple, vrai/faux, classement par boutons, association, texte à trous, réponse courte (correction IA présentée comme indicative). Corrections objectives déterministes.
- **« Autre exemple »** : variantes pré-générées, changement sur place **sans appel IA**, hauteur réservée. « Plus simple » et les actions par partie sont retirés.
- **« Essayer une autre formulation »** avec motifs (trop compliqué, trop court, trop long, pas assez concret, information incorrecte ou absente, autre + commentaire) : nouvelle version liée ; un fait signalé incorrect est d'abord revérifié contre la source.
- **Rôles IA** : `AI_REPORT_MODEL` (rapports) et `AI_CHAT_MODEL` (discussion, corrections) ; noms de modèles retirés des écrans courants (transparence gardée dans Confidentialité et dans l'administration).
- **Import** « Que voulez-vous comprendre ? » : Fichier / Lien / Texte, ligne compacte du fichier (nom, taille, pages détectées, Remplacer, ×), « Créer mon Limpid », « Voir mes Limpid », étapes réelles de préparation.
- **Bibliothèque** : recherche repliable à côté du titre avec les **5 recherches récentes** du compte et un indicateur de recherche active ; filtres **Tous / Prêts / En cours / Échecs** sur une ligne ; **dossiers** en premier (supprimer un dossier ne supprime jamais ses Limpid) ; « Nouveau dossier » ; appui long ou ⋯ → **Déplacer vers…** ; date et heure (« Aujourd'hui · 14:32 ») ; échecs expliqués avec **Réessayer** (mêmes réglages, limites du compte).
- **Menu** : Accueil (bibliothèque), Nouveau Limpid, Nouveau dossier, Paramètres, dossiers, Limpid (échecs masqués), **pastille rouge non lu** (texte accessible) et **sablier** en cours.
- **Paramètres** : langue de l'interface, langue des explications, approche par défaut, familiarité, objectif, confort de lecture, apparence, **Réinitialiser mes préférences** ; thème par défaut et thèmes retirés ; **À propos de nous** (goooroo corporate) ; pied **« Propulsé par gooroo »** (jamais dans le lecteur) ; notifications flottantes.
- **Interface en anglais** : dictionnaire complet (mêmes clés que le français, vérifié par tests), choix immédiat dans les Paramètres (cookie `limpid-lang`, sinon langue du navigateur), dates, messages de connexion, de mot de passe, d'API et du PDF traduits.
- **Export PDF** depuis le document structuré : style unique, annexes (limites, glossaire, sources), « Avec les exercices » (sans réponses) et « Corrigé » séparés, **filigrane discret des exports gratuits décidé côté serveur** (`profiles.plan`).

### EN TEST (résultats réels)
- `npm test` : 199 tests ; typecheck ; build de production ; **recette SQL OK** (nouvelles tables isolées par compte, suppression d'un dossier sans perte).
- **Gemini réel (offre gratuite)**, approches Explication claire et Révision active : statut `validated`, 5 parties, 4 points clés, 2 et 5 points de contrôle, bilan de 7 questions sur 6 types, aucune erreur bloquante. Tous les modèles « flash » sont **hors quota aujourd'hui** (429) ; le repli `gemini-3.1-flash-lite` a tout produit. Avec ce modèle léger, peu d'exemples et aucune variante : à revoir avec le modèle principal.
- Recette visuelle locale (sorties réelles ci-dessus) : 320, 360, 390, 430, 768, 1024, 1440 px et paysage 844×390, très grand texte, mouvement réduit et activé, français et anglais : **0 violation axe**, aucun débordement horizontal ; seules les pièces plus hautes que l'écran défilent (couverture, point de contrôle, paysage). Parcours : sommaire, options, retour qui ferme le panneau, point de contrôle (carrousel suspendu puis reprise), bilan, autre formulation, Discuter, Fermer → bibliothèque, autre exemple, dossiers, déplacer, échecs, menu.

### À FAIRE / LIMITES
- Migration `20261006000000_v4_reader_library.sql` : **à appliquer en production à la fusion**.
- Parcours complet en production (import → génération → lecture → quiz → bibliothèque → export) : à vérifier après déploiement, sur un quota Gemini disponible.
- Le contenu d'un Limpid reste dans sa langue d'explication ; seule l'interface change de langue.

## Phase 11.1 — Navigation façon Gemini et lecteur plein écran (5 octobre 2026)

### FAIT
- **Barre d'en-tête unique** sur une ligne : menu, logo Limpid, Profil, Paramètres. **Plus aucune flèche de retour** : le retour est celui du téléphone ou du navigateur ; seules les croix ferment les volets. Le contenu remonte d'autant.
- **Menu latéral** (volet depuis la gauche sur téléphone et tablette, barre fixe ≥ 1200 px) : Accueil (ajouter un document), Ajouter un texte, Ajouter un PDF, Ajouter un lien, Paramètres, puis **Bibliothèque** avec la liste des limpid (préparation en cours et échec signalés), profil en pied.
- **Bibliothèque = page principale** (`/`) avec **bouton flottant** « Expliquer un document » vers l'Accueil (page d'import, onglet présélectionné depuis le menu). `/bibliotheque` redirige.
- **Profil** (`/compte`) et **Paramètres** (`/parametres` : explications, confort de lecture, mode d'affichage, thème par défaut, installation, données) ; anciennes adresses redirigées.
- **Présentation en plein écran** : aucune barre de l'application autour d'un limpid ; sur téléphone et tablette, le navigateur passe en plein écran à l'ouverture (refus silencieux s'il ne le permet pas, iPhone compris) et en sort en quittant.
- **Trois boutons en bas de chaque limpid** :
  - **Sommaire** : plan avec la position de lecture, options du rapport (export PDF, présentation, source, hors connexion, versions, suppression), retour à la bibliothèque.
  - **Me tester** : **Interrogation** (3 questions sur la partie en cours) ou **Devoir** (QCM de 5 à 10 questions sur tout le document), rédigés par l'IA à partir des explications du limpid, une question à la fois, correction expliquée pour chaque proposition, bilan limité à la série avec les parties à revoir, « Recommencer » et « D'autres questions ». Tests gardés par version (rouvrir = aucune requête), table `report_quizzes` (RLS lecture propriétaire, écriture serveur, effacée avec le rapport).
  - **Poser une question** : réponse courte fondée sur les passages du document et la partie lue, **citations vérifiées mot pour mot** (sinon retirées), « Au-delà du document » séparé, suites proposées. Échange non enregistré.
- Débit et budget : 12 tests et 30 questions par heure et par compte, plafonds de dépense existants, consommation journalisée (`quiz_gen`, `ask`) et visible dans `/admin`.

### EN TEST (résultats réels)
- `npm test` : 170 tests ; recette SQL OK (isolation et effacement des tests) ; build OK.
- **Gemini réel (offre gratuite)** : devoir de 5 questions valide (bonne réponse à des positions variées), réponse avec citation vérifiée (`scripts/live-reader-ai.test.ts`, 2 requêtes).
- Recette visuelle locale : tous les écrans de 320 à 1440 px + nuit : **0 violation axe, 0 débordement** ; menu, QCM (juste, à revoir, bilan) et questions vérifiés à 390 et 1440 px. Captures : `docs/recette/v3-1/captures/`.

### À FAIRE / LIMITES
- Migrations `20261005000000_v3_themes_originals.sql` et `20261005010000_report_quizzes.sql` : **à appliquer en production à la fusion**.
- Chaque test nouveau et chaque question consomment une requête Gemini (quota gratuit : 20 par jour et par modèle, avec repli).

## Phase 11 — Refonte V3 (kit « LIMPID_V3 », 5 octobre 2026)

Cadrage (QCM, 13 réponses) : socle visuel d'abord ; navigation Accueil / Bibliothèque / Compte ; parcours tout automatique ; 5 thèmes du kit ; mode nuit ; polices du kit ; animations expressives (mouvement réduit respecté) ; bureau comme le kit ; original gardé 30 jours ; « Demander » et la nouvelle révision à la passe suivante ; abonnement « bientôt » ; installable et lecture hors connexion.

### FAIT
- **Système visuel** : jetons du kit (ivoire, encre, jaune, vert), polices locales Inter / Source Serif 4 / IBM Plex Mono, logo, 36 icônes, mode clair/sombre/système (le PDF reste clair), taille du texte, contraste renforcé, mouvement réduit (réglage appareil et réglage Limpid). Feuilles de style découpées (`src/app/styles/`).
- **Animations** : entrée d'écran, apparition en cascade, livre animé de préparation (sans pourcentage), étapes qui se cochent, volets (bas d'écran sur mobile, panneau latéral ≥ 1200 px), squelettes de chargement, bouton occupé, célébration du quiz réussi. Désactivées avec le mouvement réduit.
- **Coquille responsive** : < 700 px barre du bas ; 700–1199 px rail compact ; ≥ 1200 px barre latérale avec « Ajouter un document ». Barre de lecture fixe dans le rapport. Aucun débordement horizontal de 320 à 1440 px.
- **Parcours automatique** : Ajouter un document → Document ajouté (un seul aperçu, « Ouvrir le PDF », approche annoncée, note de fidélité) → « Expliquer mon document » sans réglage : niveau et objectif tirés des préférences, longueur selon la taille du texte (≤ 12 000 caractères : 5 pages, ≤ 60 000 : 7, au-delà : 12), thème choisi selon l'organisation du rapport. Préparation : 4 étapes dérivées de l'étape réelle de la tâche, titre qui change, « Revenir à l'accueil ». Erreur : « Lecture à compléter » avec actions.
- **Lecteur** : en-tête « Votre rapport » et options (export PDF, présentation, source, enregistrement hors connexion, versions, suppression) ; **notions soulignées** (première occurrence) ouvrant « Une notion en clair » (définition, source, « Vérifier si j'ai compris ») ; source citée avec « Ouvrir l'original » ou « Original indisponible » ; barre Sommaire / Me tester / Demander (« bientôt ») ; sommaire « Dans ce rapport » avec la position de lecture ; schémas aux couleurs du thème et du mode nuit.
- **5 thèmes** (Sciences, Récit, Dossier, Guide, Confort), web et PDF, choix « Automatique » ; anciens thèmes convertis (Essentiel → Dossier, Visuel → Guide, Éditorial → automatique).
- **Original conservé 30 jours** (`LIMPID_RETENTION_ORIGINAL_HOURS=720`) et servi par `/api/sources/[id]/original` (propriétaire seulement, lien signé de 60 s) ; envoi non utilisé : 24 h ; échec de lecture OCR : effacé.
- **Bibliothèque** : onglets Rapports / Sources, recherche par titre, filtres effaçables (Tous, Prêts, En préparation, À revoir), états distincts, état vide, exemple ; sources avec original indisponible et réimport.
- **Compte** : profil, utilisation réelle (rapports sur 24 h, sans tarif), Préférences de lecture directes (familiarité, objectif, explications concrètes, taille, animations, contraste), Apparence (mode + thème par défaut), Abonnement (« bientôt », aucun tarif), Utilisation, Confidentialité et données (durées issues de la configuration, suppression du compte), Installer, Mot de passe, Administration. Anciennes adresses `/rapports` et `/preferences` redirigées.
- **PWA** : manifeste et icônes, service worker (`public/sw.js`) : fichiers statiques en cache, pages en réseau d'abord, **rapports enregistrés lisibles hors connexion** (cache par compte, effacé à la déconnexion ou au changement de compte), écran « Hors connexion », bandeau réseau, mise à jour proposée. CSP : `worker-src 'self'`, `manifest-src 'self'`.

### EN TEST (résultats réels)
- `npm test` : 161 tests ; recette SQL OK (avec la migration V3) ; build OK.
- Recette visuelle locale (données de démonstration, sans réseau) : 18 écrans × 320, 390, 768, 1024, 1440 px + mode nuit à 390 px : **0 violation axe (WCAG 2.2 AA), 0 débordement horizontal**. Volets notion, options, sommaire, source vérifiés (focus rendu au mot). Captures : `docs/recette/v3/captures/`.

### NON TESTÉ / À FAIRE
- Migration `20261005000000_v3_themes_originals.sql` : **à appliquer en production au moment de la fusion** (l'ancien code écrit encore les anciens thèmes).
- Service worker et installation : à vérifier sur téléphone après déploiement (actifs en production seulement).
- Passe suivante : « Demander au document », révision V3 (QCM, relier, ordonner), favoris, renommer, signaler.

## Correctifs après livraison (4 octobre 2026)
- **Diagnostic Gemini** : une requête sans donnée était refusée (HTTP 400) ; corrigé (PR #10).
- **Conservation des rapports : 30 jours** après création (décision du propriétaire), effacement complet par le cron quotidien (`purgeExpiredReports`, journal `report.expired`), date affichée dans le lecteur, durée affichée dans le diagnostic. `LIMPID_RETENTION_REPORT_DAYS=30` par défaut.
- **Administrateur** : rôle admin accordé à l'adresse du propriétaire (liste blanche et profil), action journalisée.


## Phase 10 — Cahier V2, lot E : recette et livraison (4 octobre 2026)

Rapport complet : **`docs/LIVRAISON.md`** (terminé / partiel / non testé, corpus, production, migrations, configuration, versions, captures, procédure téléphone).

### FAIT
- **Corpus de recette** (`scripts/corpus/`, `scripts/live-corpus.test.ts`) : PDF natif avec tableau, contradiction et source courte, injection, PDF sur deux colonnes, cinq niveaux. Seuils du cahier atteints sur le corpus : références 100 %, 28/28 citations, 29/29 nombres, 20/20 idées essentielles, aucun texte injecté repris.
- **Correctifs issus de la recette** : chiffres cités mais absents du texte (contrôle par bloc), phrases chiffrées non reprises (couverture des chiffres), limites de portée (« valent pour… »). Consignes `2026-10-04.2`.
- **PDF sur deux colonnes** : ordre de lecture reconstruit quand le flux mélange les colonnes ; tableaux et pages à une colonne inchangés.
- **Modèles de repli déclarés** (`LIMPID_MODEL_FALLBACKS`) sur quota épuisé ou surcharge, journalisés ; visibles dans `/admin`.
- **Scénarios automatisés** : XSS (analyse DOM), liens http(s) seulement, PDF produit malgré une image illisible, panne du fournisseur sans toucher la version précédente, repli d'image, réservation unique, bail expiré repris, pas de double débit (SQL).
- **Production** : isolation vérifiée (compte inconnu : 0 ligne sur 12 tables ; compte réel : exactement ses lignes ; transaction annulée, aucun contenu lu). Usage réel relevé (agrégats).
- **Suivi** « Votre rapport prend forme » : liste des étapes réelles (sans pourcentage), « Retrouvez le rapport dans Mes rapports ».
- **Captures mobiles** (11 écrans, dont 3 en production) et exemples PDF : `docs/recette/lot-e/`.

### EN TEST (résultats réels)
- `npm test` : 151 tests ; recette SQL OK ; build OK ; axe : 0 violation sur 11 écrans à 360 et 390 px.
- Gemini Image : quota gratuit à 0 constaté (`gemini-3.1-flash-lite-image`).

### NON TESTÉ / BLOQUANT
- **Critère final non atteint** : aucune génération n'a encore abouti en production (2 tâches, quota du jour de `gemini-3.5-flash` épuisé). Procédure et réglage du repli dans `docs/LIVRAISON.md`.


## Phase 9 — Cahier V2, lot D : illustrer et optimiser (4 octobre 2026)

Exemples : `docs/recette/lot-d/` (même rapport dans les trois présentations, mesures).

### FAIT
- **Trois présentations** (Éditorial, Essentiel, Visuel), web et PDF : composition, couleurs et encadrés seulement, même texte et mêmes sources. Choix à la création (« Présentation »), dans le lecteur (changement immédiat, **aucune requête IA**) et par défaut dans Préférences (« Un style, le même contenu »). Essentiel : fond blanc, pas d'image décorative.
- **Schémas déterministes** dessinés par le code à partir de données validées : flux (existant), **graphique en barres** (les valeurs sont reprises des nombres des affirmations soutenues, jamais du modèle ; unités identiques exigées) et **tableau comparatif** (une cellule sans affirmation soutenue affiche « Non précisé par la source »). Version texte pour chaque schéma.
- **Illustrations** (au plus 2 par rapport), ordre du cahier : schéma, puis banque autorisée, puis image générée ; sinon texte seul.
  - **Wikimedia Commons** (gratuit, actif) : recherche limitée aux fichiers, licences réutilisables seulement (CC0, domaine public, CC BY, CC BY-SA), fichiers à restrictions écartés, pertinence vérifiée sur le titre, téléchargement protégé (hôtes Wikimedia seulement, type réel, taille, dimensions), budget de 8 s. Auteur, licence, lien de licence, page d'origine et modification (« Redimensionnée ») conservés et affichés (web et PDF).
  - **Unsplash** (conditionnel, coupé) : clé et activation requises ; affichage depuis l'hébergeur avec suivi de téléchargement et attribution ; jamais dans le PDF.
  - **Gemini Image** (coupé) : modèle image séparé (`LIMPID_IMAGE_MODEL`), activation explicite, 20 images/mois/compte, plafonds vérifiés avant chaque image, consigne expurgée sans texte ni chiffre, légende « générée par IA, sans valeur documentaire ».
  - La requête d'image est générique et expurgée (mots simples en anglais, sans chiffres ni ponctuation) ; aucun extrait du document n'est envoyé aux banques.
  - Une nouvelle version complète reprend les illustrations déjà trouvées (pas de nouvelle recherche ni de nouvelle image).
- **Données** : table `visual_assets` (provenance et droits, distincte des preuves), RLS propriétaire, écriture refusée après suppression du rapport, fichiers effacés avec le rapport. Colonnes `reports.theme_id` / `visual_mode`, `reader_preferences.theme_id`, étape « Recherche d'illustrations adaptées ». Migration appliquée en production.
- **Réglages** : « Présentation » visible ; « Illustrations » sous Options (seuls les modes réellement disponibles sont proposés).

### EN TEST (résultats réels)
- Recette réelle (`scripts/live-visuals.test.ts`, `gemini-3.5-flash-lite` + Commons réel) : rapport validé ; flux, graphique « Évolution du rendement du réseau » (75,6 % → 79,5 %, valeurs identiques aux affirmations) et une photo Commons CC BY-SA 4.0 trouvée en 0,8 s ; crédits présents dans les PDF Éditorial et Visuel, aucune image en Essentiel ; toutes les sections présentes dans les trois PDF.
- Défaut trouvé et corrigé : une adresse de crédit trop longue sortait de la page PDF (coupure des chaînes de plus de 40 caractères).
- `npm test` : 137 tests (connecteurs, licences, pertinence, quota d'images, reprise des illustrations, schémas, PDF dans les trois présentations). Recette SQL (isolation des illustrations entre comptes, écriture tardive refusée) OK sur Postgres 16. Build OK. axe : 0 violation (lecteur dans les trois présentations avec graphique, tableau et illustration, réglages, préférences), 360 et 1 440 px.

### NON TESTÉ
- Parcours complet en production (illustration stockée puis servie par `/api/reports/:id/assets/:assetId`, export PDF avec image).
- Unsplash et Gemini Image : non activés (clé ou compte payant requis), donc non essayés en réel.

### NON FAIT / LIMITES
- Visuels extraits du document (figures du PDF) : non repris, faute de droits connus et de détection de figures.
- La pertinence d'une photo n'est jugée que sur son titre public ; une image hors sujet reste possible (elle est légendée comme illustration, sans valeur de preuve).
- Pas encore de compteur « images restantes » côté utilisateur (utile seulement si Gemini Image est activé).

### PROCHAINE ÉTAPE — Lot E
Recette et livraison : corpus, tests intercomptes et de panne en production, captures mobiles, exemples PDF, rapport final terminé / partiel / non testé.

### DÉCISIONS À PRENDRE
- Activer Unsplash (clé d'API gratuite à créer) et/ou Gemini Image (compte payant) ?

## Phase 8 — Cahier V2, lot C : renforcer le cerveau (4 octobre 2026)

### FAIT
- **Vérification indépendante des affirmations** : après la compréhension, un appel séparé relit chaque affirmation face à son extrait exact (± 160 caractères de contexte) et rend `supported`, `partial`, `unsupported` ou `contradicted`. Le verdict ne peut que rendre un statut plus prudent. Désactivable avec `LIMPID_VERIFY_CLAIMS=off`.
- **Statuts `partial` et `contradicted`** dans le contrat. Une affirmation `unsupported` ou `contradicted` utilisée comme fait bloque la publication ; `partial` ou `ambiguous` impose une formulation prudente (avertissement).
- **Niveaux et organisations** : consigne détaillée pour chacun des 5 niveaux (vocabulaire, analogies contrôlées avec leur limite, exercices qui demandent de reformuler ou d'appliquer) ; séquence de sections par template ; le lecteur peut imposer l'organisation.
- **Écran « Vérifier la source »** (maquette) : la lecture du document est séparée de la génération. Type, titre, pages lues, aperçu page par page (‹ n/N ›), passages peu lisibles, puis « Continuer ». Aucune requête IA à cette étape ; une source non utilisée est effacée au bout de 24 h.
- **Écran « Votre rapport »** : style d'explication avec sa description, longueur en boutons (5 / 7 / 12 pages), « Options » repliées (objectif, organisation), coût annoncé.
- **Créer** : « Un document. Des idées claires. » et carte « Dernier rapport ».
- **Régénération ciblée d'une section** : « Plus simple » et « Un autre exemple » sous chaque partie, coût annoncé (1 requête). Seule cette section est réécrite ; les autres restent identiques et la numérotation des sources [n] est conservée (les nouvelles sources s'ajoutent à la fin). Nouvelle version avec un motif dédié dans l'historique.

### EN TEST (résultats réels)
- Gemini réel (`gemini-3.5-flash-lite`, vérification activée) : rapport validé ; citations 11/11 dans source, web et PDF ; nombres 13/13 ; idées essentielles 8/8 ; 6 appels (dont 1 de vérification), ≈ 32 s, ≈ 0,07 €.
- Régénération réelle d'une section (« Plus simple ») sur ce rapport : validée, une seule section modifiée, chiffres conservés (148 L, 135 L), numérotation des sources inchangée.
- `npm test` : 121 tests. Typecheck et build OK. axe : 0 violation sur « Vérifier la source », « Votre rapport » et le lecteur avec actions par section, à 360 et 1 440 px.

### NON TESTÉ
- Parcours complet en production (préparation de la source puis création, régénération d'une section depuis le téléphone).

### REPORTÉ (quota gratuit)
- **Carte globale des longs documents** (compréhension par morceaux puis synthèse) et **vision sélective** (OCR des seules pages utiles) : ces deux points multiplient les appels et entament vite les 20 requêtes/jour/modèle. À reprendre avec l'offre payante, ou au lot E après mesure.

### PROCHAINE ÉTAPE — Lot D
Thèmes Éditorial / Essentiel / Visuel, schémas, illustrations (Wikimedia Commons gratuit ; Unsplash et Gemini Image selon décision).

## Phase 7 — Cahier V2, lot B : tranche complète réelle (4 octobre 2026)

Détail et mesures : `docs/RECETTE_LOT_B.md` ; exemples : `docs/recette/lot-b/`.

### FAIT
- **Recette réelle de bout en bout** (`scripts/live-slice.test.ts`) : PDF natif de 4 pages → extraction → Gemini réel → lecteur web (rendu serveur) → export PDF relu ; contrôles de fidélité et de parité web/PDF, mesures par étape.
- **Réponse hors schéma** : correction demandée au modèle avec la liste des écarts (2 fois au plus) au lieu d'un échec immédiat.
- **Couverture des réserves** : contrôles déterministes à la compréhension (phrases de réserve ou de limite de la source) et à l'explication (affirmations de réserve), une demande de correction ciblée chacun ; reste consigné en avertissement.
- **`/admin`** : diagnostic à la demande (configuration, base, aller-retour stockage privé, URL d'envoi signée, appel Gemini facultatif) et durées p50/p95 par étape et par rapport, taux de réussite.

### EN TEST (résultats réels)
- Gemini réel (`gemini-3.5-flash-lite`) : rapport validé ; citations 12/12 dans source, web et PDF ; nombres 14/14 ; idées essentielles **8/8** (6/8 avant la correction de couverture) ; 5 appels, ≈ 49 s, ≈ 0,07 €.
- `npm test` : 116 tests (dont correction hors schéma, couverture des réserves, percentiles). Typecheck et build OK ; axe : 0 violation sur l'administration.

### NON TESTÉ
- Critère final du cahier en production (téléphone, fermeture d'onglet, base et stockage réels) : procédure en 4 étapes dans `docs/RECETTE_LOT_B.md`.

### PROCHAINE ÉTAPE — Lot C
Écran « Vérifier la source » (pages lues, aperçu, pages peu lisibles) avant la génération ; carte globale du document pour les longs textes ; contrôle indépendant « l'extrait soutient-il l'énoncé » ; statuts `partial` / `contradicted` ; régénération d'une section avec coût annoncé.

## Phase 6 — Cahier V2, lot A : audit et sécurisation (4 octobre 2026)

Référence : « Le cerveau de Limpid » (directives V2, 23 pages) et trois planches de maquettes (douze vues mobiles).

### FAIT
- **Audit** `docs/AUDIT_V2.md` : chaque directive du cahier (P0/P1/P2, architecture, contrats, quotas, sécurité, écrans) classée existant / partiel / manquant / non vérifié, avec les fichiers concernés.
- **Connexion email + mot de passe** (P0), écran conforme à la maquette : adresse, mot de passe avec « Afficher / Masquer », « Mot de passe oublié ? », « Se connecter », puis « ou Recevoir un lien » (lien magique conservé, comptes existants inchangés).
  - Réponse identique pour une adresse inconnue, non autorisée ou un mauvais mot de passe.
  - Essais limités par adresse et par IP (8 par quart d'heure pour la connexion, 3 pour la récupération), clés hachées, sans verrouillage permanent (table `auth_attempts`, migration appliquée).
  - « Mot de passe oublié » : lien de récupération à usage unique de Supabase ; la session de récupération (revendication `amr`) mène à « Choisir un mot de passe ».
  - « Définir ou changer mon mot de passe » depuis Préférences pour les comptes créés par lien ; règles (10 caractères, pas uniquement des chiffres, pas l'adresse, pas trop répétitif) ; autres sessions fermées après le changement ; gestionnaires de mots de passe pris en charge (`autocomplete`).
- **Limites anti-abus** (cahier § 13), configurables : 3 nouveaux rapports par 24 h et 1 tâche active par compte. Le compte se fait dans le journal d'audit, qui survit à la suppression d'un rapport (supprimer puis recréer ne contourne pas la limite). Un échec technique rend le crédit.

### EN TEST (résultats réels)
- `npm test` : 108 tests (dont règles de mot de passe et lecture de `amr`). Typecheck et build OK.
- axe-core sur Connexion, Mot de passe oublié et Choisir un mot de passe, à 360 et 1 440 px : deux défauts trouvés (cible « Mot de passe oublié » trop petite, champ mot de passe sans le style commun) et corrigés → 0 violation.

### NON TESTÉ
- Connexion par mot de passe et récupération contre le vrai Supabase (envoi de l'email de récupération, retour sur `/auth/callback`). À vérifier en production.

### PROCHAINE ÉTAPE — Lot B puis C
Lot B : tranche complète réelle, vérifiée de bout en bout sur téléphone (PDF natif → rapport Grand public → PDF), avec mesure des durées et des coûts. Lot C : écran « Vérifier la source », couverture globale (carte des sections), contrôle « l'extrait soutient-il l'énoncé », statuts `partial` / `contradicted`, régénération ciblée par section avec coût annoncé.

### DÉCISIONS À PRENDRE
- Conservation des rapports : 30 jours (cahier § 19) ou jusqu'à suppression manuelle (cadrage Q18, actuel) ?
- Quotas : le cahier propose 10 crédits/mois et un plafond de 100 USD ; l'alpha est réglée à 10 € avec l'offre gratuite Gemini (20 requêtes/jour/modèle).
- Lot D (illustrations) : Gemini Image et Unsplash supposent un compte payant ou une clé d'API ; Wikimedia Commons est gratuit.

## Phase 5 — Administration, suppression de compte, accessibilité (4 octobre 2026)

### FAIT
- **Tableau de bord `/admin`**, réservé au rôle admin vérifié en base à chaque requête (page introuvable pour les autres comptes ; lien depuis Préférences pour l'admin) :
  - dépense estimée du mois et des dernières 24 h face aux plafonds, jauge du plafond mensuel, détail par étape (compréhension, explication, OCR, quiz) ;
  - **quota gratuit Gemini du jour, par modèle** (requêtes depuis minuit heure du Pacifique, sur 20) ;
  - coupe-circuit (suspendre / réactiver toute génération) et plafond mensuel modifiable, borné par la configuration serveur ;
  - liste blanche : ajout (rôle utilisateur ou admin) et retrait, impossible de se retirer soi-même ou de retirer le dernier admin ;
  - tâches récentes (type, état, code d'erreur) et journal d'audit ; aucune donnée de document affichée. Chaque action admin est journalisée.
- **Suppression du compte** (Préférences → Mon compte) : confirmation écrite « SUPPRIMER », liste de ce qui est effacé ; rapports marqués supprimés d'abord (le worker ne peut plus écrire), tâches annulées, fichiers effacés (chemins connus puis tout le préfixe du compte dans les buckets), lignes supprimées, puis l'utilisateur d'authentification (cascade). Compte rendu sans contenu dans le journal d'audit ; déconnexion et message de confirmation. L'adresse reste dans la liste blanche (sinon le propriétaire ne pourrait plus revenir).
- **Accessibilité** : audit axe-core (WCAG 2.0/2.1/2.2 A et AA + bonnes pratiques) sur connexion, démonstration, formulaire Créer, lecteur (quiz, versions, actions), Préférences (+ suppression de compte) et administration, à 360 et 1 440 px ; une violation trouvée (deux régions de même nom sur l'admin) et corrigée → **0 violation**, aucun débordement horizontal.

### EN TEST (résultats réels)
- `npm test` : 106 tests (dont le calcul de minuit heure du Pacifique, été comme hiver). Typecheck et build OK.
- Rendu 360 px de l'administration (données fictives) et de la zone de suppression vérifié en Chromium.

### NON TESTÉ
- Actions admin et suppression de compte contre la vraie base : la clé `service_role` n'est pas utilisable depuis cette session. À essayer en production (pour la suppression : avec une adresse de test ajoutée depuis l'admin, pas avec le compte propriétaire).

### PROCHAINE ÉTAPE — Phase 6 (proposée)
Passage en revue de sécurité complet avant d'inviter d'autres personnes (2FA admin, cadrage Q8), page « Mes rapports » avec recherche et tri, partage en lecture seule d'un rapport, PWA installable.

## Phase 4 — Lecture OCR, nouvelles versions, quiz corrigé (4 octobre 2026)

### FAIT
- **Images et PDF scannés** (JPG, PNG, WEBP ; PDF sans couche texte) lus par la vision Gemini, **avec accord explicite avant l'envoi** (cadrage Q15) : case à cocher pour une image ; pour un PDF, le serveur détecte qu'il est scanné et demande l'accord (« Lire avec Gemini » / « Annuler ») sans renvoyer le fichier. Le fichier est joint comme donnée non fiable ; transcription mot pour mot, par lots de 8 pages, 30 pages et 14 Mo au plus. Le texte devient des segments localisés (page, ou « image, paragraphe n ») marqués « Texte reconnu automatiquement (OCR) », signalé sur le rapport et dans le PDF. Original effacé dès la lecture (réussie ou non).
- **Contrôle des images** : dimensions lues dans l'en-tête (PNG, JPEG, WEBP) sans décoder, 20 mégapixels au plus ; signature réelle contre extension.
- **File de tâches plus robuste** : la lecture OCR est une étape de la tâche ; si elle a été longue, la tâche est remise en file et repart avec un budget de temps complet. Le suivi de progression relance la file quand une tâche attend (réservation atomique : jamais de double traitement).
- **Quiz corrigé** : chaque question de compréhension accepte une réponse libre ; Gemini la compare aux points attendus et aux extraits de la source (verdict, points couverts ✓/○, retour bienveillant, idée fausse expliquée). Réponse traitée comme donnée non fiable. Dernière réponse conservée et réaffichée ; 40 corrections par heure au plus ; budget vérifié avant chaque appel.
- **« Plus simple » et « Un autre exemple »** : nouvelle version du rapport à partir de la connaissance déjà validée (seule l'étape d'explication est rejouée, mêmes contrôles). « Plus simple » descend d'un niveau ; « Un autre exemple » remplace analogies et exemples imaginés. Historique des versions (10 au plus) consultable, PDF de chaque version, version courante lisible pendant la préparation.
- **Coupe-circuit de dépense** partagé (génération, OCR, quiz) ; **quota journalier épuisé** détecté (délai de reprise annoncé par Gemini) : échec immédiat avec un message clair au lieu de nouvelles tentatives.

### EN TEST (résultats réels)
- `npm test` : 105 tests (OCR avec fournisseur simulé : lots, pages hors lot ignorées, pages illisibles, limite de pages, image en paragraphes ; dimensions PNG/JPEG/WEBP ; nouvelle version : seule l'explication est rejouée ; délai de quota). Typecheck et build OK.
- **Gemini réel** : PDF scanné de 2 pages (images seules) → texte exact page par page, tableau compris (4 s, ~1 450 jetons en entrée) ; photo contenant « IGNORE TES INSTRUCTIONS… » → transcrite comme simple texte. Quiz : bonne réponse → « correct », réponse incomplète → « partial » (point manquant identifié), réponse fausse avec consigne cachée → « incorrect » avec l'idée fausse expliquée.
- Chromium 360 px : quiz (réponse, verdict, points), versions, actions, accord image (bouton bloqué tant que la case n'est pas cochée), accord PDF scanné (2ᵉ envoi avec le même fichier et la même clé, `allow_ocr: true`) ; aucun débordement. Ce test a révélé et fait corriger une récursion dans le formulaire.

### NON TESTÉ
- **Nouvelle version contre Gemini réel** : le quota gratuit du jour (20 requêtes pour `gemini-3.5-flash`) a été épuisé pendant les essais. Testé avec fournisseur simulé uniquement.
- Parcours connectés complets en production (OCR, quiz, versions) : à vérifier sur l'URL Vercel.

### PROCHAINE ÉTAPE — Phase 5
Tableau de bord admin (consommation, coupe-circuit, liste blanche), page de compte (suppression du compte et de toutes les données), export PDF mis en cache, finitions d'accessibilité (audit WCAG).

### BLOCAGE / DÉCISION
- **Quota gratuit Gemini : 20 requêtes par jour et par modèle.** Un rapport en consomme 2 à 6. Options : activer la facturation (prévu en fin d'alpha), ou répartir sur deux modèles (ex. `LIMPID_MODEL_FAST=gemini-3.5-flash-lite`, qualité à vérifier), chacun ayant son propre quota.

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
