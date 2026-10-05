# Livraison V5 — « Améliorer l'existant » (5 octobre 2026)

Point de départ : l'audit `docs/AUDIT_V5.md` (constats étiquetés [code] / [test] / [prod] / [non vérifié]).
Aucune donnée de production n'a été lue ni modifiée pour cette recette ; aucun lot coûteux n'a été lancé.

## Synthèse

| Zone | Fait | Preuve |
|---|---|---|
| Import | Plusieurs documents (jusqu'à 5) en une fois, puis « Ajouter des documents » sans perdre la sélection. La grande zone de dépôt laisse place à une liste compacte (nom, type, taille, pages, état). Chaque fichier a son état (en attente, envoi n %, lecture, prêt, lecture des images, échec) et ses actions Réessayer / Remplacer / Retirer. Envois et lectures limités à 2 simultanés. | [code] `ImportForm.tsx`, [test] R03–R05 |
| Sortie | « Un Limpid commun » (par défaut) ou « Un Limpid par document » ; le bouton dit combien de Limpid seront créés. Tant qu'un document est en échec, la création est bloquée : rien n'est ignoré sans décision explicite. | [code], [test] R04–R05 |
| Approches | Quatre cartes en 2 × 2, icônes illustrées locales en léger relief, groupe radio accessible (flèches), « Explication claire » présélectionnée puis le dernier choix explicite. | [code] `ModeIcon.tsx`, [test] R01–R02 |
| Limpid commun | Table `report_sources` (ordre des documents) ; identifiants de segments préfixés par document pour le moteur (`seg_d2-14`) puis ramenés à (source, segment) à l'enregistrement. Consignes : contradictions signalées, aucun document n'a autorité sur les autres. Références nommant leur document. Anciens Limpid inchangés (mêmes identifiants). | [code] `source-set.ts`, [test] `source-set.test.ts` |
| Un Limpid par document | Lot idempotent (clé par document), limites du compte vérifiées pour tout le lot avant de créer quoi que ce soit, tâches indépendantes. | [code] `createBatch`, `api/reports/batch` |
| OCR | Automatique (plus d'étape d'accord) ; page par page pour les PDF mixtes : seules les pages sans texte natif sont lues, dans les limites de pages et d'octets. Consigne : nombres, tableaux et formules conservés, figures porteuses de sens décrites (`[Figure : …]`), `[illisible]` plutôt qu'une invention. Texte lu figé : rien n'est relu à la navigation. | [code] `ocr.ts`, `worker.ts`, [test] `ocr.test.ts` |
| Doublons | Empreinte SHA-256 du fichier, comparée **dans le même compte** seulement ; signalé « Déjà dans vos documents », sans blocage. | [code] `prepare.ts` |
| Recherche | Dans le flux, 250 ms après la dernière frappe, sans réseau ni IA ; portée affichée ; repli selon le clavier virtuel ; 5 recherches récentes par compte. | [code], [test] `search.test.ts`, R06 |
| Dossiers | Appui long (mobile) ou « Sélectionner » (menu) → sélection multiple ; barre flottante ; « Déplacer vers… » avec Bibliothèque, dossiers, « Nouveau dossier » ; déplacement en une requête filtrée par propriétaire ; « Déplacé vers X » avec Annuler. Suppression de dossier : garder les Limpid (par défaut) ou les supprimer, choix séparé et confirmé. | [code], [test] R09–R10 |
| Annexes | Page continue `/rapports/[id]/annexes` (même rapport, même version) : glossaire filtrable sans IA, sources ancrées (`#src-N`, document, page, extrait, original), limites et remarques de lecture, conservation. Aucune annexe dans le carrousel. Options et fin du Limpid : Annexes / Sources / Glossaire. « Retour au rapport » rétablit la vue exacte ; la réponse non validée d'un exercice est conservée. | [code], [test] R15–R20, `safety.test.ts` |
| Références | Indices discrets en exposant, zone tactile de 44 px ; ouvrent l'annexe à la bonne source. Une notion ouvre aussi « Voir dans le glossaire ». | [code], [test] R16–R17 |
| Schémas | Libellés des schémas de flux et des barres coupés sur plusieurs lignes selon leur largeur estimée ; la boîte grandit, rien n'est tronqué. | [code] `wrap.ts`, [test] `wrap.test.ts` |
| Paramètres | Une seule entrée « Préférences — Adapter les explications à vos besoins » ; confort et apparence restent séparés ; aucun thème de rapport. | [code], [test] R23 |
| Administration | Cartes par traitement lisibles sur mobile : état, phase, âge, documents, pages natives / OCR, durée, temps IA, tentatives, coût, code d'erreur — aucune donnée privée. Reprendre / Annuler ciblés, journalisés, réservés aux administrateurs. | [code] `admin-jobs.ts`, [test] `admin-jobs.test.ts`, R26 |

## Recette (banc local, Chromium, données de test — aucune donnée réelle)

Script : parcours import → bibliothèque → recherche → sélection → déplacement → lecteur → référence → annexe → retour → Options → glossaire → paramètres → administration, avec axe (WCAG 2.2 AA) et contrôle du débordement horizontal à chaque écran.

| Taille | Contrôles fonctionnels | Débordement horizontal | axe |
|---|---|---|---|
| 320 × 640 | tous OK | aucun | voir note |
| 360 × 740 | tous OK | aucun | voir note |
| 390 × 844 | tous OK | aucun | voir note |
| 430 × 932 | tous OK | aucun | voir note |
| 768 × 1024 (tablette) | tous OK | aucun | aucune violation |
| 1280 × 800 (bureau) | tous OK | aucun | aucune violation |
| 844 × 390 (paysage) | tous OK | aucun | aucune violation |
| 320 et 390, texte « très grand » | tous OK | aucun | voir note |

Contrôles couverts : R01 quatre cartes en 2 × 2 ; R02 « Explication claire » présélectionnée ; R03 liste compacte et « Ajouter des documents » ; R04 choix commun / par document ; R05 un échec bloque la création ; R06 recherche sans aucune requête réseau, portée affichée ; R09 appui long (toucher réel) ou « Sélectionner » (bureau), sélection multiple, rien ne s'ouvre ; R10 panneau « Déplacer vers… » ; R15 aucune annexe dans le carrousel ; R16 indices en exposant ; R17 référence → annexe à la bonne source ; R18 « Retour au rapport » → même vue, adresse nettoyée ; R19 Options → Annexes / Sources / Glossaire ; R20 aucune requête IA en consultant les annexes ; R23 une seule entrée Préférences, aucun thème de rapport ; R26 traitements et actions dans l'administration.

Note axe : seule la règle « target-size » apparaît, et seulement sur des captures prises après un défilement, quand l'en-tête collant recouvre en partie un bouton ; sur un chargement direct des mêmes pages, aucune violation.

Pagination du lecteur (aucun texte coupé, aucune pièce sous le bouton Discuter) : conforme à 390, 430, 768, 1280 px. À 320, 360 px et en paysage, seuls les points de contrôle (quiz) dépassent la hauteur d'écran : ils forment leur propre vue qui défile, le carrousel étant suspendu pendant le quiz ; rien n'est masqué ni réduit.

## Corrections trouvées pendant la recette

- **Appui long** : la barre de sélection s'insérait en haut de la liste, la décalait, et le relâchement du doigt ouvrait l'élément qui se retrouvait dessous (un dossier). Barre désormais flottante en bas, clic de relâchement absorbé.
- **Couverture trop haute** : un Limpid commun ajoute des remarques de lecture sous le titre ; avec les points clés, la couverture dépassait l'écran à 320–390 px. Couverture et points clés (par groupes de 3) sont désormais des pièces distinctes.
- **Schéma en paysage** : hauteur bornée à l'écran de lecture (proportions conservées).
- **Retour d'annexe** : en mode strict (développement), l'ancre de retour était retirée de l'adresse avant la mise en page ; et la position de défilement initiale (couverture) était enregistrée comme progression. Ancre lue une seule fois, retirée après la mise en page ; rien n'est enregistré avant la première composition.

## Migration (à appliquer avant le déploiement)

`supabase/migrations/20261007000000_v5_multi_sources.sql` — ajouts uniquement :

- table `report_sources` (RLS : lecture par le propriétaire ; écritures par le serveur), remplie pour les Limpid existants (leur source en position 0) ;
- colonne `sources.file_sha256` et index par compte.

La bibliothèque lit `report_sources` : la migration doit précéder le déploiement. Tests RLS : `supabase/tests/rls.test.sql` (isolation des ensembles de sources entre comptes).

## Variables d'environnement

Aucune nouvelle variable. Plafonds inchangés : 3 Limpid / 24 h et 1 préparation simultanée par compte ; un lot « un Limpid par document » est refusé s'il dépasse les crédits restants.

## Retour arrière

- Code : revenir au commit de fusion précédent sur Vercel (Instant Rollback).
- Base : la migration est additive ; l'ancien code ignore `report_sources` et `file_sha256`. Ne pas supprimer la table tant que des Limpid communs existent (ils perdraient leurs documents 2 à 5).

## Limites connues

- Mention « opérations regroupées » : demandée au rédacteur par consigne, pas encore portée par le schéma de flux lui-même.
- Le fichier de référence « Mwat Mwat » n'a pas été fourni : régression R07/R12 à rejouer avec le fichier réel.
- Génération réelle d'un Limpid commun non rejouée sur Gemini dans cette session (quota gratuit) ; couverte par les tests du moteur et des identifiants.
- Ancien lecteur derrière un indicateur interne : il avait déjà été retiré en V4 ; non rétabli.
