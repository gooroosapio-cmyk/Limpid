# LIMPID — PROMPT CLAUDE FINAL
## Comptes utilisateurs, abonnements, crédits en direct, moteur Gemini et paiements Chariow

Version proposée : 5 octobre 2026, révision tarifaire. Ce document est une spécification à implémenter, pas une attestation de déploiement ni de tests réalisés sur Limpid.

Révision tarifaire : Gratuit, bonus mensuel de 80 crédits (4 rapports) avec au plus 2 rapports par semaine ; Essentiel 2 900 FCFA (12 rapports) ; Plus 5 900 FCFA (30 rapports) ; Pro 11 900 FCFA (75 rapports) ; annuel au prix de dix mensualités ; recharges de 1 000, 2 500 et 5 000 FCFA (3, 9 et 25 rapports). Un « rapport » s'entend d'un rapport standard à 20 crédits : les allocations sont donc 80, 240, 600 et 1 500 crédits par mois.

## 0. Mission et règles de priorité

Tu interviens dans le dépôt existant de Limpid comme une équipe produit, UX mobile, développement full-stack, sécurité, facturation et assurance qualité.

CONSTRUIS ET TESTE le système décrit ici. Ne te limite pas à une maquette, à une recommandation ou à du pseudo-code. Commence par inspecter les dépendances, la base de données, l’authentification, les rôles, les routes de génération, les tâches persistantes, le stockage et les intégrations de paiement réellement présents. Adapte les noms proposés au code existant sans dupliquer les systèmes.

Préserve les comptes, sources, rapports, dossiers, préférences, historique, logo, couleurs et composants utiles. Ne réinitialise pas les utilisateurs pour faire fonctionner une migration. N’invente pas la stack ni un accès administrateur. Ne transforme pas une bibliothèque de rapports en un nouveau système de cours/leçons si ce n’est plus le modèle actuel. Le terme utilisateur de référence dans cette spécification est « rapport Limpid ».

Cette spécification remplace les anciens chiffres d’abonnement et de consommation. Elle conserve la logique commerciale choisie : prix FIXE en crédits Limpid pour une action annoncée, et comptabilité API réelle exclusivement en interne.

Limpid reste mobile-first, pensé pour une administration depuis un téléphone. Un compte gratuit est un vrai compte utilisateur, jamais un compte administrateur. Un abonnement Pro n’est jamais un rôle administrateur.

Les montants et paramètres ci-dessous sont des décisions proposées pour le produit. Les budgets moteur sont des hypothèses de calibration à vérifier par tests, pas des performances déjà mesurées. Vérifie les contrats actuels des API dans les sources officielles référencées en fin de document. N’invente aucun événement, champ, identifiant de produit ou mode de paiement.

## 1. Monnaie utilisateur et tarifs

Utilise partout « crédits Limpid », puis « crédits » lorsque le contexte est évident. Ne mélange pas « jetons », « tokens », dollars API et crédits dans le parcours client. Un crédit Limpid n’équivaut pas à un nombre fixe de tokens Gemini et n’est pas une somme remboursable en espèces.

N’expose jamais au client les tokens d’entrée, de sortie, de raisonnement, le modèle sélectionné ou le coût fournisseur : ni dans les écrans, ni dans les réponses réseau, ni dans les événements de synchronisation. La politique de confidentialité doit cependant rester transparente sur les prestataires de traitement des données.

### Offres

| Code interne | Nom public | Mensuel | Annuel | Allocation |
|---|---|---:|---:|---|
| free | Découverte — Gratuit | 0 FCFA | — | Bonus de 80 crédits par cycle mensuel (4 rapports standard), le premier cycle étant ouvert après vérification du compte ; au plus 2 rapports par semaine glissante |
| essential | Essentiel | 2 900 FCFA | 29 000 FCFA | 240 crédits par mois (12 rapports standard) |
| plus | Plus | 5 900 FCFA | 59 000 FCFA | 600 crédits par mois (30 rapports standard) |
| pro | Pro | 11 900 FCFA | 119 000 FCFA | 1 500 crédits par mois (75 rapports standard) |

Devise commerciale : XOF, affichée « FCFA ». Les prix sont les totaux catalogue proposés, pas des prix « à partir de ». Avant mise en vente, vérifier leur traitement fiscal et afficher distinctement tout supplément réellement obligatoire. Ne pas ajouter une commission surprise au retour du paiement.

L’annuel couvre douze mois pour le prix de dix mensualités : 29 000, 59 000 et 119 000 FCFA. L’allocation reste mensuelle : 240, 600 ou 1 500 crédits, jamais douze fois cette quantité au paiement. Afficher le total annuel payé en une fois. Les équivalents mensuels facultatifs sont environ 2 417, 4 917 et 9 917 FCFA, explicitement présentés comme des équivalents et non comme un paiement mensuel.

Le nombre de rapports annoncé est un équivalent, pas un compteur séparé : un forfait utilisé uniquement pour des rapports standard à 20 crédits donne exactement 4 rapports en Découverte (2 par semaine au plus), 12 en Essentiel, 30 en Plus et 75 en Pro. Une utilisation mixte (questions, QCM, images, rapports longs) réduit ce nombre ; des rapports courts à 8 crédits l’augmentent. Formulation publique : « l’équivalent de 12 rapports standard par mois », jamais « 12 rapports + questions illimitées ». Ne pas additionner plusieurs maxima marketing comme s’ils étaient tous inclus séparément.

### Recharges ponctuelles

| Code | Prix | Allocation | Validité |
|---|---:|---:|---|
| topup_70 | 1 000 FCFA | 70 crédits (3 rapports standard + 10 crédits) | 12 mois après attribution |
| topup_180 | 2 500 FCFA | 180 crédits (9 rapports standard) | 12 mois après attribution |
| topup_500 | 5 000 FCFA | 500 crédits (25 rapports standard) | 12 mois après attribution |

Prix du crédit rechargé : 14,3 FCFA (1 000), 13,9 FCFA (2 500) et 10 FCFA (5 000), contre 12,1 FCFA en Essentiel, 9,8 en Plus et 7,9 en Pro. La recharge de 5 000 FCFA est volontairement généreuse : son crédit coûte moins cher que celui d’Essentiel, mais il n’ouvre ni les droits d’abonnement, ni l’allocation mensuelle, et il expire après 12 mois. Pas de recharge en dessous de 1 000 FCFA.

Une recharge ne renouvelle pas l’abonnement et ne transforme pas un compte en Plus ou Pro. Pas de recharge automatique ni de prélèvement automatique activé implicitement.

## 2. Fonctionnalités et limites d’accès

| Limite | Découverte | Essentiel | Plus | Pro |
|---|---:|---:|---:|---:|
| Limpid générés conservés (documents produits, hors sources) | 3 | 30 | 100 | 300 |
| Nouveaux rapports par semaine glissante | 2 | — | — | — |
| Sources par rapport | 1 | 5 | 10 | 20 |
| Pages sources cumulées par rapport | 20 | 100 | 300 | 1 000 |
| Taille maximale par fichier | 10 Mo | 25 Mo | 40 Mo | 50 Mo |
| Stockage total | 100 Mo | 500 Mo | 2 Go | 5 Go |
| Générations simultanées | 1 | 1 | 2 | 3 |

Ces plafonds sont des limites d’accès et de capacité, pas des générations gratuites en supplément. Un compte Pro avec un document de 1 000 pages n’obtient pas automatiquement son analyse complète pour 20 crédits. La complexité et le périmètre de sortie font l’objet d’un devis d’action.

La pagination source et les volumes sont mesurés côté serveur. Pour un format sans pages, montrer la limite de volume pertinente, sans inventer une pagination précise. Vérifier les fichiers, le nombre de sources et le stockage cumulés, pas seulement chaque upload séparé. Réserver également le stockage nécessaire aux fichiers temporaires et aux sorties.

Découverte : lecture des sources, rapports Feynman, schémas et tableaux, Prof de Limpid, quiz, PDF avec filigrane discret. Pas de nouvelles images génératives ni de nouvelle narration audio.

Essentiel : imports multisources, PDF sans filigrane, images génératives à la demande et facturées en crédits. Les schémas structurés restent inclus dans les rapports.

Plus : fonctions Essentiel, export PowerPoint et liens de partage privés/révocables lorsque ces fonctions sont réellement implémentées et testées. Ne pas vendre une fonction simulée.

Pro : fonctions Plus, narration audio continue générée à la demande, documents plus volumineux et priorité équitable dans la file Limpid. Cette priorité n’autorise pas automatiquement un mode fournisseur plus cher.

Tous les niveaux d’explication restent disponibles dans toutes les offres. Ne pas rendre volontairement les explications du gratuit moins fiables. Les différences portent sur les volumes et fonctions, pas sur le droit à une réponse fidèle.

Après expiration ou dépassement de capacité, les contenus existants restent consultables et récupérables selon la politique de conservation. Bloquer uniquement les nouvelles actions incompatibles et expliquer la limite exacte. Ne pas supprimer automatiquement des documents au moment d’une rétrogradation. Prévoir la gestion des archives et de la conservation avant de promettre un hébergement éternel.

Les PDF déjà générés restent téléchargeables dans leur version existante. Un passage au gratuit ne modifie pas rétroactivement un PDF payé. Un nouvel export ou un nouveau traitement utilise les droits applicables et ne doit pas créer un contournement du filigrane.

## 3. Catalogue d’actions et consommation fixe

| Action | Prix public |
|---|---:|
| Rapport court | 8 crédits |
| Rapport standard | 20 crédits |
| Rapport long | 40 crédits pour le premier périmètre long admissible ; devis fixe supérieur pour les cas plus volumineux |
| Question courte au Prof ou nouvel exemple bref | 1 crédit |
| QCM de 10 questions avec corrigé | 3 crédits |
| Réécriture ou simplification d’une section bornée | 2 crédits |
| Actualisation ciblée après changement de source | Devis fixe dès 2 crédits, selon les parties réellement à refaire |
| Nouvelle image générative 1K | 16 crédits |
| Nouvelle narration audio | 7 crédits par minute commencée, durée maximale et prix plafonné acceptés avant génération |
| Lecture, dossier, renommage, favoris, consultation du glossaire déjà généré | 0 crédit |
| Réexport d’un artefact déjà disponible, sans appel IA | 0 crédit IA |

Conserver les prix image/audio de départ : diminuer les tokens texte ne réduit pas automatiquement leurs coûts de production. Aucun supplément image ne doit être activé automatiquement.

Un rapport standard inclut son analyse nécessaire, son résumé, son explication structurée, ses schémas déterministes, son glossaire et les éléments pédagogiques explicitement annoncés au devis. Ce n’est pas une facturation séparée par étape technique. Une densité de 5 à 7 pages PDF est un objectif de format, pas une obligation de remplir artificiellement les pages.

Si un quiz contextuel est inclus dans le rapport, sa lecture, ses réponses et sa correction déterministe ne coûtent rien de plus. Les 3 crédits concernent la création demandée d’un NOUVEAU QCM. Même distinction pour un exemple déjà disponible et un nouvel exemple généré.

Le prix dépend de l’action réellement demandée. Ne pas laisser une « question à 1 crédit » devenir un rapport complet, un lot de 50 réponses ou un contournement d’une analyse longue. Une demande hors périmètre reçoit un nouveau devis AVANT l’appel coûteux, jamais une majoration après résultat.

Les grandes opérations sont divisées en modules livrables explicites, chacun tarifé avant acceptation. Le total est connu avant le lancement. Un module qui échoue n’est pas facturé. Une image optionnelle qui échoue n’annule pas la facturation d’un rapport valide livré.

Toutes les voies de génération passent par ce catalogue et le même service de consommation : chat, sélection de texte, reformulation, autre exemple, actualisation, quiz, images, audio, génération automatique, tâches planifiées et endpoints internes. Aucun bouton secondaire ne doit contourner le quota.

## 4. Réduire réellement la consommation Gemini sans tronquer

Objectif : davantage de générations avec la même qualité pédagogique, grâce à la réduction du travail redondant, non grâce à l’omission de sources importantes.

### Cibles initiales, privées et à tester

Les nombres ci-dessous sont des enveloppes cumulées sur les appels normaux d’une action, pas un budget répété pour chaque étape. La sortie inclut les tokens de raisonnement facturables. Les retries techniques sont enregistrés séparément et bornés par la réserve d’incident.

| Action | Entrée cumulée cible maximale | Sortie facturable cumulée cible maximale | Routage initial |
|---|---:|---:|---|
| Question courte | 4 000 tokens | 900 tokens | Modèle économique validé |
| QCM 10 questions | 5 000 | 1 800 | Modèle économique validé |
| Section | 3 500 | 1 000 | Modèle économique validé |
| Rapport court | 10 000 | 2 400 | Modèle rapport validé |
| Rapport standard | 24 000 | 6 000 | Modèle rapport validé |
| Premier périmètre long | 48 000 | 12 000 | Traitement hiérarchique et borné |

Ces seuils ne sont pas des garanties de qualité ou des plafonds universels compatibles avec tous les modèles. Avant chaque appel, recalculer l’admissibilité au regard du modèle, de ses paramètres réellement supportés, du contexte et du budget monétaire restant. Un faible niveau de raisonnement peut ne pas imposer un plafond numérique strict : prévoir la marge nécessaire.

Prévoir des variables serveur pour modèle économique, modèle rapport, vérification, image et audio. N’imposer aucun identifiant de modèle tiré d’un ancien prompt. Vérifier disponibilité, modalités, prix, limites, dépréciation et support des sorties structurées. Ne pas utiliser une route fournisseur de secours sans prix connu ni relancer deux fournisseurs en parallèle.

Mettre en œuvre : extraction une seule fois par version de source ; OCR ciblé sur pages scannées ou extraction insuffisante ; indexation par sections avec pages de référence ; contexte minimal pertinent pour le chat ; résumé contrôlé des échanges anciens ; compression des prompts répétitifs ; JSON structuré compact ; composants de rendu déterministes ; réutilisation des schémas et illustrations existants ; actualisation des seuls blocs invalidés.

Pour un rapport d’ensemble, traiter toutes les parties requises par un plan de couverture. La récupération de quelques passages pertinents, adaptée à une question ciblée, ne remplace pas une lecture de couverture du document entier. Lorsque la couverture intégrale excède le budget standard, annoncer un rapport long ou un périmètre choisi explicitement.

Ne pas générer HTML, CSS, SVG arbitraire, mise en page et contenu pédagogique complet à plusieurs reprises. Gemini produit une structure validée ; Limpid fait le rendu. Contrôler les chiffres, unités, citations, causalités et termes difficiles. Une réduction de tokens qui détériore ces points n’est pas une optimisation acceptable.

L’OCR, les embeddings éventuels, la vérification et les appels de préparation ne sont pas « gratuits » parce qu’ils ne sont pas affichés. Aucun appel IA payant de pré-analyse avant réservation : le précontrôle gratuit reste local et borné ; une analyse plus coûteuse entre dans l’opération autorisée.

N’utiliser un cache fournisseur payant qu’après estimation de son bénéfice net, avec durée de vie contrôlée. Aucun cache documentaire partagé entre utilisateurs sans mécanisme de droits explicite. Aucune recherche Web, exécution de code ou recherche d’image facturable activée implicitement pour une réponse documentaire ordinaire.

## 5. Comptabilité fournisseur et viabilité

Règle budgétaire de calibration proposée : enveloppe normale maximale de 0,005 USD par crédit Limpid attribué à une action, plus une réserve d’incident de 30 % financée par Limpid. Il ne s’agit pas d’un taux de conversion affiché au client.

Ainsi, le budget normal d’un rapport standard est 20 × 0,005 = 0,10 USD. Si son coût probable est supérieur, adapter le plan avant devis ou classer l’action dans un autre périmètre. Ne jamais diminuer silencieusement la couverture après paiement.

Hypothèse prudente de simulation : 650 FCFA/USD, frais Chariow 15 %, réserve API 30 %. Ce taux de change est une hypothèse interne, pas un cours vérifié. Les frais réellement prélevés remplacent l’hypothèse lors du rapprochement comptable.

| Offre mensuelle | Recette après hypothèse Chariow | API + réserve au plafond | Contribution avant autres charges |
|---|---:|---:|---:|
| Essentiel | 2 465 FCFA | 1 014 FCFA | 1 451 FCFA |
| Plus | 5 015 FCFA | 2 535 FCFA | 2 480 FCFA |
| Pro | 10 115 FCFA | 6 337,50 FCFA | 3 777,50 FCFA |

Calcul : 0,005 USD × 1,30 × 650 = 4,225 FCFA par crédit au plafond, réserve comprise ; 240, 600 et 1 500 crédits par mois.

Pour l’annuel, la contribution mensuelle correspondante devient environ 1 040,17 / 1 644,17 / 2 091,67 FCFA. Le Pro est le palier le plus sensible : un Pro annuel qui consomme toute son allocation ne laisse qu’environ 21 % de la recette nette. Surveiller en priorité son coût réel par crédit.

Recharges, au plafond : 1 000 FCFA → 554,25 ; 2 500 FCFA → 1 364,50 ; 5 000 FCFA → 2 137,50 FCFA de contribution. Ce n’est pas une marge nette : hébergement, OCR hors Gemini, rendu/export, stockage, emails, files d’attente, support, fiscalité, acquisition, remboursements et fraude restent à financer.

Les tarifs fournisseur doivent être versionnés avec date d’effet, modèle, modalité et mode de traitement. Ne pas dimensionner un abonnement annuel exclusivement sur une remise fournisseur temporaire. Les prix officiels consultés le 5 octobre 2026 affichent notamment des tarifs Flash différents à compter du 1er janvier 2027. Vérifier de nouveau au déploiement. [R1]

Par appel, journaliser le modèle exact, la version tarifaire, les catégories de tokens, la durée, l’état, le nombre de tentatives et le coût en microdollars. Les compteurs de référence incluent promptTokenCount, cachedContentTokenCount, candidatesTokenCount et thoughtsTokenCount. L’entrée totale inclut l’entrée cachée : la soustraire avant de tarifer la portion non cachée. Ne pas tarifer totalTokenCount comme une catégorie supplémentaire. [R2]

Calculer selon l’adaptateur tarifaire : entrée non cachée, entrée cachée, sortie texte, raisonnement et modalités spécifiques, plus frais d’outils applicables. Éviter tout double compte entre coût d’une image et coût des mêmes tokens image. Ne pas sommer des compteurs de streaming cumulatifs comme des deltas.

Un compteur absent signifie coût à rapprocher, jamais coût nul. Les tentatives échouées et appels restés incertains font partie du coût entreprise. Conserver une estimation prudente jusqu’au rapprochement fournisseur. N’enregistrer ni raisonnement interne ni document intégral dans le journal financier.

Les paramètres maxOutputTokens et de raisonnement doivent correspondre au modèle et à l’API réellement utilisés. Compter le contexte avant l’appel, limiter l’ensemble du workflow et contrôler le budget restant avant chaque étape. La formule illustrative n’est pas suffisante pour prétendre garantir un plafond absolu de facture fournisseur.

## 6. Moteur transactionnel des crédits

États minimaux d’une génération : DRAFT, QUOTED, RESERVED, QUEUED, RUNNING, SUCCEEDED, FAILED, CANCEL_REQUESTED, CANCELLED, RECONCILIATION_REQUIRED. Les transitions sont contrôlées côté serveur ; certains états de tâche et d’usage fournisseur peuvent rester distincts.

Un devis contient le propriétaire, le type d’action, le périmètre, la version des sources, les modules, le prix fixe, le plafond accepté, la version tarifaire, les droits nécessaires et une expiration. Durée initiale proposée : 10 minutes. Le navigateur ne choisit ni le prix ni le compte à débiter.

À l’acceptation, une transaction vérifie les droits actuels, le devis, la source, les limites, le solde et le budget global ; réserve les lots de crédits ; crée la tâche ; inscrit un événement dans une outbox persistante ; incrémente la version du portefeuille. La file reçoit ensuite l’événement via un traitement fiable de l’outbox.

Verrouiller les lignes de portefeuille/lots ou employer un mécanisme transactionnel équivalent avec retry contrôlé des conflits. Une simple succession « lire solde, appeler Gemini, retirer crédits » est interdite.

L’identifiant d’idempotence est lié au compte et à l’empreinte de la demande. Rejouer le même identifiant avec un autre contenu est refusé. Un double clic retourne la même tâche ; une nouvelle action volontaire emploie un nouvel identifiant. Deux appareils ne peuvent dépenser le même solde.

Le worker valide les sources figées et revendique la tâche avec un bail et un jeton de fencing. Un worker ancien ne doit pas publier ou solder après une reprise par un nouveau worker. Ne pas appeler Gemini depuis une transaction longue de base de données.

La sortie est validée, sauvegardée durablement et rendue accessible avant de considérer le module comme livré. La facturation fixe est associée au module livré et enregistrée une seule fois. Un échec d’écriture, de validation ou de rendu nécessaire n’est pas présenté comme une réussite facturable.

Le client ne paie jamais davantage que le maximum accepté. Une dérive due au moteur est absorbée par Limpid et déclenche une alerte de calibration. Les économies internes n’imposent pas de remboursement puisque le prix commercial est fixe, contrairement à un portefeuille facturé au coût réel.

Un dépassement de durée de réservation en file peut libérer une tâche non démarrée. Une tâche RUNNING ne doit jamais être libérée automatiquement sur un simple délai si un appel fournisseur peut encore aboutir : utiliser bail, heartbeat et rapprochement. Prévoir un plafond d’attente et un traitement des tâches orphelines pour ne pas bloquer indéfiniment le compte.

Limiter les tentatives : au maximum une reprise automatique d’une erreur transitoire, dans la réserve définie. Pas de reprise automatique aveugle sur timeout fournisseur incertain, authentification invalide, refus de sécurité, entrée invalide ou manque de budget. Ne pas confondre le retry de transport et une nouvelle génération commerciale.

## 7. Lots, expirations, remboursements de crédits et annulations

Conserver les crédits par lots : allocation gratuite (dont celle du premier cycle), allocation d’abonnement, recharge, compensation ou migration identifiée. Chaque lot possède quantité initiale, disponible, réservée, consommée, expiration et origine traçable.

Consommer d’abord ce qui expire le plus tôt. À échéance égale, préférer les allocations à la recharge payée. Les crédits mensuels inutilisés expirent à la fin du cycle sans report. Les recharges expirent douze mois après attribution. Montrer ces dates avant achat et dans le portefeuille.

Le bonus gratuit du premier cycle (80 crédits) n’est attribué qu’une fois, après vérification du compte ; il n’existe pas de bonus de bienvenue distinct qui s’y ajouterait. Les bonus gratuits suivants (80 crédits par cycle, sans report) ne sont pas versées pendant un abonnement payant. Un éventuel lot gratuit restant lors du premier achat garde son échéance sans créer de nouvelle allocation.

Une réservation effectuée avant expiration peut être honorée après expiration si sa tâche était valablement engagée. Une restitution remet les crédits dans leurs lots et à leur échéance d’origine. En cas d’échec imputable à Limpid après cette échéance, une compensation distincte de sept jours peut être accordée une seule fois, plafonnée à la somme affectée. Ne pas permettre de prolonger les crédits par des annulations volontaires répétées.

L’annulation avant démarrage libère intégralement les crédits. Une annulation après appel fournisseur est une demande de meilleur effort : finaliser ou arrêter au prochain point sûr. Ne facturer que les modules valides effectivement livrés et préalablement acceptés. Les modules incomplets ne sont pas facturés ; leurs coûts techniques restent suivis. Les abus de lancement/annulation déclenchent limitation ou revue, pas un débit caché.

Fermer l’onglet, perdre la connexion ou verrouiller le téléphone n’annule pas la génération. Les tâches restent consultables au retour.

Les remboursements financiers et restitutions de crédits sont deux opérations différentes. Un remboursement financier confirmé déclenche une écriture compensatoire unique, la révocation des avantages restant rattachés à la vente et le traitement explicite de la consommation antérieure. Pas de solde négatif exploitable, pas de débit bancaire supplémentaire, pas de suppression silencieuse du journal. Les modalités commerciales et légales doivent être validées avant publication.

## 8. Affichage réactif et synchronisation en direct

Afficher le solde disponible dans l’en-tête, la page Compte et le panneau de génération. Utiliser un composant partagé alimenté par le même état serveur.

Exemple exact pour Plus :

- Avant action : « 600 crédits disponibles ».
- Après réservation confirmée : « 580 disponibles · 20 réservés ».
- Pendant le traitement : « Votre rapport est en préparation. 20 crédits réservés. »
- À la livraison : « 580 crédits disponibles » et historique « Rapport standard · −20 crédits ».
- En cas d’échec : « 600 crédits disponibles » et « La génération n’a pas abouti. Vos 20 crédits ont été libérés. »

Ne pas déduire une deuxième fois les 20 crédits au passage réservé → consommé. Ne pas faire baisser le compteur à chaque mot généré : cela simulerait une facturation variable qui n’existe pas. Le texte peut arriver progressivement ; la comptabilité évolue lors de transactions réelles.

Employer SSE ou le mécanisme temps réel fiable existant, avec canaux privés, authentification, event_id, wallet_version et reprise après reconnexion. Ne transmettre que des DTO publics : available, reserved, next_expiry, cycle_end, plan_label, job_state et horodatage. Aucun identifiant de source tierce, token API ou coût interne.

Ignorer les événements plus anciens. Après une interruption, demander un snapshot serveur puis reprendre les événements à partir d’un curseur compatible pour éviter la course snapshot/abonnement. Vérifier l’authentification à la reconnexion et lors des changements de session. Purger les caches privés au logout ; ne pas servir un ancien portefeuille via service worker.

Prévoir un polling de secours avec backoff seulement sur les vues actives ou opérations en attente ; l’arrêter lorsque l’opération est terminale. Utiliser BroadcastChannel seulement comme optimisation locale, jamais comme autorité financière.

Cible de test : propagation après commit en moins de deux secondes sur une connexion normale, sans présenter cette cible comme garantie absolue. Sur réseau indisponible : « Synchronisation en attente ». Ne pas afficher un faux zéro. Aucune opération facturable hors ligne n’est envoyée automatiquement sans revalidation au retour.

Progression : états réels « Vérification des fichiers », « Lecture des sources », « Construction de l’explication », « Mise en forme », « Finalisation ». Pas de pourcentage inventé ni de progression qui reste artificiellement à 99 %. Limiter les annonces aria-live aux changements utiles.

## 9. Création de nouveaux comptes utilisateurs

Créer ou corriger les parcours publics /inscription et /connexion, en conservant les méthodes de connexion existantes qui fonctionnent. Une seule identité et un seul portefeuille par compte ; pas une seconde table d’utilisateurs applicatifs parallèle.

À l’inscription : recueillir l’email et le moyen d’authentification nécessaire. Le prénom peut être facultatif. Ne demander nom complet et autres informations de paiement qu’au moment où Chariow les exige. Ne pas demander une carte bancaire pour Découverte.

Utiliser le fournisseur d’identité éprouvé déjà intégré. Si email/mot de passe est supporté, prévoir affichage/masquage, gestionnaire de mots de passe, vérification email et réinitialisation sécurisée. Conserver le lien magique lorsque pertinent. N’afficher une connexion Google que si elle est réellement configurée et testée.

État initial : rôle user, offre free, vérification en attente, aucun droit payant et aucun crédit dépensable avant validation. Après vérification serveur, exécuter un bootstrap idempotent qui garantit profil + préférences de base + portefeuille + allocation unique du premier cycle gratuit (80 crédits). Une reprise de callback, un trigger ou une deuxième connexion ne redonne aucune allocation.

Prévoir la réparation idempotente d’un compte authentifié dont le profil applicatif est incomplet. Ne pas contourner l’email non vérifié pour « réparer » l’onboarding. Une erreur d’écriture doit conduire à une reprise sûre et un message utile.

Les préférences pédagogiques sont facultatives, modifiables et sans débit. Aucun appel Gemini n’est nécessaire pour enregistrer le questionnaire d’accueil. Le niveau d’explication le plus simple utilise des analogies accessibles sans qualifier l’utilisateur d’enfant.

Les liaisons entre méthodes de connexion nécessitent les vérifications prévues par le fournisseur. Ne pas fusionner deux comptes sur une adresse de paiement, une ressemblance de nom ou un email non vérifié. Changer l’email, réinitialiser le mot de passe ou réactiver une session ne crée pas une nouvelle allocation.

Aucune création automatique de compte admin depuis un paiement, un webhook, une licence ou une inscription. Un achat effectué hors session n’est pas attribué sur la seule correspondance d’email.

## 10. Rôles, sessions et isolation

Séparer au minimum : rôle d’autorisation, identité, état du compte, offre commerciale et droits calculés. Exemple : role=user avec plan=pro reste un utilisateur normal.

Interdire les champs role, is_admin, plan, balance, credits ou owner_id pilotés par le client lors de l’inscription ou de l’édition du profil. Ne jamais prendre une métadonnée modifiable par l’utilisateur comme source de privilège. Si Supabase est présent, ne pas fonder les droits admin sur user_metadata ; contrôler les droits depuis une source serveur protégée.

Le rôle initial user est garanti par défaut de base, politiques et code serveur. Aucun mécanisme « premier inscrit = admin ». Aucun admin déduit d’une adresse email écrite en dur dans le front. Les administrateurs existants sont conservés après vérification de leur identité et de leur rôle réel ; leur promotion est un acte serveur explicite et audité.

Protéger toutes les routes admin et toutes les mutations sur le serveur. Masquer un menu n’est pas une protection. RLS lorsqu’elle existe, filtrage propriétaire systématique, contrôles d’objet et stockage privé. Tester l’accès croisé aux rapports, fichiers, devis, tâches, commandes, licences, exports, soldes et canaux temps réel. [R10]

Sessions sécurisées selon la stack, défense CSRF pour les écritures authentifiées par cookie, politiques CORS strictes, callbacks OAuth et redirections autorisés, réauthentification pour opérations sensibles, limitation de tentatives et messages ne facilitant pas l’énumération des comptes. MFA pour l’administration. Ne pas développer son propre système de chiffrement de mots de passe. [R9]

Limiter aussi les emails de vérification et de récupération. Les appels publics GET ne doivent pas lancer une génération ni un achat ; prendre en compte scanners de liens, previews et préchargements des navigateurs.

Séparer développement, tests, staging et production : comptes, bases, clés API, produits et secrets. Aucun compte de test ne reçoit de droit illimité en production par accident. Les usages IA de l’admin en production sont comptabilisés dans un budget dédié, pas ignorés.

## 11. Écrans et textes des comptes gratuits

### Inscription

Titre : « Créez votre compte Limpid ».
Sous-titre : « Commencez gratuitement : 80 crédits offerts chaque mois pour rendre vos documents plus clairs. »
Bouton principal : « Créer mon compte gratuit ».
Lien secondaire : « J’ai déjà un compte ».
Mention : « Sans carte bancaire. Votre compte reste gratuit tant que vous ne choisissez pas une offre payante. »

### Vérification

Titre : « Vérifiez votre adresse email ».
Texte : « Confirmez votre adresse pour activer vos 80 crédits gratuits (4 rapports). »
Actions : « Renvoyer le lien » et « Corriger mon adresse ».
Afficher un délai de renvoi réel et contrôlé côté serveur ; ne pas le confier uniquement à un compteur navigateur.

### Bienvenue

Badge : « Découverte · Gratuit ».
Titre : « Votre espace est prêt ».
Texte : « Vous disposez de 80 crédits, soit 4 rapports, à utiliser à raison de 2 rapports par semaine au plus. Un nouveau bonus de 80 crédits arrive à chaque cycle mensuel. »
Détail : « Les crédits mensuels ne se cumulent pas. »
Actions : « Importer mon premier document » et lien discret « Voir les offres ».

### En-tête et Compte

Badge permanent mais discret « Gratuit », « Essentiel », « Plus » ou « Pro ».
Pour le gratuit : « 32 crédits disponibles » ; « Prochains crédits : 80, le [date] » ; si la limite hebdomadaire est atteinte : « Limite de 2 rapports cette semaine atteinte. Prochain rapport possible le [date]. » (pas de recharge proposée comme solution à cette limite, seulement les offres) ; bouton « Découvrir Premium ».
Pour le payant : allocation, solde disponible/réservé, date de fin d’accès et prochaine attribution distinctes. Dans l’annuel, ne pas confondre la prochaine allocation mensuelle et la fin des douze mois.

### Solde insuffisant

Titre : « Il vous manque 6 crédits ».
Texte : « Cette action utilise 20 crédits. Vous en avez 14 disponibles. »
Actions : « Recharger mes crédits », « Voir les offres » et fermeture simple.
Mention : « Vos rapports existants restent accessibles. »

Si la limite est le stockage, une fonction Pro ou le volume d’import, dire cette raison au lieu de proposer une recharge inefficace. Proposer la bonne action : libérer de l’espace, modifier le périmètre ou changer d’offre.

Aucune fausse période d’essai, aucun compteur anxiogène, aucune modale de vente qui bloque systématiquement la lecture. Déclencher les messages commerciaux aux moments pertinents seulement.

## 12. Présentation des offres inspirée de Gemini

S’inspirer de la structure lisible des offres Gemini : nom, promesse courte, prix, capacité incluse, bénéfices du palier et bouton principal. Conserver intégralement l’identité Limpid, sans logo Google ni promesse d’affiliation. [R8]

Titre : « Choisissez votre rythme avec Limpid ».
Sous-titre : « Plus de crédits pour comprendre, réviser et créer vos supports. »
Sélecteur Mensuel / Annuel ; mention « 2 mois offerts » pour l’annuel, avec total annuel clairement visible : 29 000, 59 000 et 119 000 FCFA.

Découverte : « Pour essayer Limpid à votre rythme. » Prix 0 FCFA. Mention « 80 crédits par mois · l’équivalent de 4 rapports · 2 par semaine au plus ». Bouton « Continuer gratuitement » ou « Offre actuelle ».

Essentiel : « Pour comprendre vos documents régulièrement. » 2 900 FCFA/mois, 240 crédits/mois, l’équivalent de 12 rapports. Mettre en avant PDF sans filigrane, plusieurs sources et accès aux images à la demande. Bouton « Choisir Essentiel ».

Plus : « Pour étudier et avancer plus souvent. » 5 900 FCFA/mois, 600 crédits/mois, l’équivalent de 30 rapports. Badge « Recommandé », pas « Le plus populaire » sans données. Mettre en avant capacités accrues, PowerPoint et partage disponibles. Bouton « Choisir Plus ».

Pro : « Pour vos documents volumineux et un usage soutenu. » 11 900 FCFA/mois, 1 500 crédits/mois, l’équivalent de 75 rapports. Mettre en avant narration, gros volumes et file prioritaire. Bouton « Choisir Pro ».

Sous les offres : « Les crédits sont communs à toutes vos générations. Un rapport standard utilise 20 crédits ; le prix de chaque action est indiqué avant de commencer. » Puis « Besoin d’un coup de pouce ? Recharges dès 1 000 FCFA, sans abonnement. » Puis « Images génératives et audio consomment des crédits supplémentaires lorsqu’ils sont demandés. »

Ajouter un comparatif détaillé repliable comprenant toutes les limites du tableau, les coûts des actions, l’expiration des crédits, la validité des recharges et le mode de renouvellement. Pas de mot « illimité ».

Sur téléphone : cartes lisibles sans débordement, commandes accessibles avec une main, espace suffisant pour montants et boutons, pas de carrousel qui cache le gratuit. Réutiliser les styles actuels et les modes clair/sombre. Un bouton fixe contextuel peut rappeler l’offre choisie et son TOTAL à payer sans masquer le contenu.

Inclure une FAQ courte : « Que coûte un rapport ? », « Les crédits se cumulent-ils ? », « Que se passe-t-il à zéro crédit ? », « Une recharge change-t-elle mon offre ? », « Mon paiement renouvelle-t-il automatiquement l’accès ? ».

## 13. Achat et redirection directe vers Chariow

Parcours normal : sélection de l’offre → connexion/vérification si nécessaire → récapitulatif → création d’une commande serveur → redirection vers le checkout Chariow → confirmation serveur → actualisation du compte.

La sélection de l’offre est préservée pendant l’inscription. Le compte est créé gratuit ; les droits payants ne sont attribués qu’après confirmation de vente. Ne pas rediriger arbitrairement vers /admin après une connexion.

Le récapitulatif affiche l’offre, la durée, le total en FCFA, l’allocation et son rythme, le compte bénéficiaire, les règles d’expiration et le renouvellement prépayé. Pour une recharge, afficher explicitement « N’ajoute pas de mois d’abonnement ».

Bouton : « Payer [montant] FCFA sur Chariow ».
Mention : « Vous allez être redirigé vers le paiement Chariow. Vos crédits seront ajoutés après confirmation. »

Créer un payment_intent interne lié à l’utilisateur authentifié, avec snapshot du catalogue et référence opaque. Le serveur choisit le produit depuis une table autorisée. Le client ne fournit jamais un montant faisant autorité ni une quantité libre de crédits.

L’API Checkout documente product_id, email, first_name, last_name, redirect_url et custom_metadata. Elle retourne notamment les états payment, completed et already_purchased. Pour payment, utiliser data.payment.checkout_url. Référencer la commande interne via custom_metadata.order_ref. Les produits de type licence autorisent les achats répétés ; d’autres types peuvent bloquer un client possédant déjà le produit. [R3]

Recueillir les champs réellement requis par l’API et la configuration du produit avant l’appel ; ne pas inventer le nom, le prénom ou le téléphone du client pour satisfaire un schéma. Le prénom et le nom ne deviennent pas obligatoires pour l’inscription gratuite simplement parce qu’ils le sont au checkout.

Configurer neuf références catalogue : trois offres mensuelles, trois annuelles et trois recharges. Exemples de codes INTERNES : essential_monthly (2 900), essential_yearly (29 000), plus_monthly (5 900), plus_yearly (59 000), pro_monthly (11 900), pro_yearly (119 000), topup_70 (1 000), topup_180 (2 500), topup_500 (5 000). Les véritables product_id Chariow sont à charger depuis la boutique ; ne jamais publier des identifiants fictifs ou un lien générique présenté comme un checkout opérationnel.

Privilégier des produits licence adaptés aux achats répétés. La licence peut servir de justificatif/récupération, mais l’utilisateur connecté ne doit pas recopier une clé à chaque recharge. Le compte utilisateur reste l’autorité de rattachement des avantages dans Limpid.

Conserver l’identifiant de vente et l’URL de checkout dès réception. Un double clic doit réutiliser la même commande locale. Ne pas supposer que l’API Chariow garantit l’idempotence d’un POST si cela n’a pas été confirmé. En cas de timeout de création, classer la commande « résultat incertain » et rechercher la vente avant de générer aveuglément un second checkout.

Restreindre redirect_url à une liste serveur et valider le domaine HTTPS de checkout renvoyé. Ne jamais accepter une URL arbitraire du client. Éviter les fenêtres bloquées sur mobile ; privilégier une redirection dans le même onglet et un parcours de retour robuste.

## 14. Retour de paiement et récupération

La page de retour consulte la commande côté serveur. Ni ?success=true, ni le contenu local, ni une capture d’écran ne prouvent le paiement.

États et textes :

PENDING : « Nous attendons la confirmation de votre paiement. Vos crédits apparaîtront ici dès sa validation. » Actions « Vérifier à nouveau » et « Retourner à mes documents ». Ne pas suggérer immédiatement de payer une deuxième fois.

SUCCEEDED : « Paiement confirmé. Votre offre [nom] est active. » ou « [nombre] crédits ont été ajoutés à votre compte. » Afficher le nouveau solde obtenu du serveur.

FAILED : « Le paiement n’a pas été confirmé. Aucun crédit n’a été ajouté. » Ne pas affirmer qu’aucun argent n’a été débité si le prestataire ne l’a pas confirmé. Proposer la reprise autorisée après vérification.

REVIEW : « Votre paiement nécessite une vérification. Conservez votre référence [référence]. » Donner un accès support, sans accorder de crédits provisoires illimités.

SESSION_EXPIRED : demander une reconnexion au compte bénéficiaire puis reprendre la vérification. Ne pas transférer l’achat au compte différent actuellement connecté.

Prévoir une page « Retrouver un achat » par commande ou clé, avec vérification de propriété, limitation de tentatives et rattachement unique. Aucune recherche publique permettant de retrouver les comptes à partir d’une adresse email ou d’une licence devinable.

Un paiement réussi sans métadonnée de rattachement devient une vente à rapprocher, pas un nouveau compte admin ni une attribution au premier utilisateur présentant l’email du payeur. Une suppression de compte pendant le paiement déclenche une revue/remboursement selon la politique, pas la recréation d’un compte et de son allocation gratuite.

## 15. Webhook Chariow sécurisé

Créer ou corriger POST /api/webhooks/chariow, HTTPS uniquement. Aucun secret dans l’URL.

Contrat à respecter : HMAC-SHA256 sur le corps HTTP BRUT, signature dans x-chariow-signature au format sha256=<hex>. Le secret du Pulse est distinct de la clé API. La signature ne contient pas d’horodatage ; les en-têtes de routage ne font pas partie du corps signé. x-pulse-delivery-id identifie la livraison ; un rejeu manuel peut en créer un nouveau. Les tests de tableau de bord peuvent être signés sans identifiant de livraison. [R4]

Vérifier taille du corps, format, signature et schéma. Utiliser une comparaison en temps constant avec contrôle de longueur. Ne jamais recalculer la signature à partir de JSON.stringify d’un objet déjà parsé. En cas de signature invalide, refuser sans modification du portefeuille.

Après authentification, enregistrer durablement le webhook dans une inbox transactionnelle avec empreinte du corps et état de traitement, puis renvoyer le 2xx. Si l’écriture durable échoue, renvoyer un échec permettant une reprise. Ne jamais ACK avant persistance ; ne pas utiliser un Set en mémoire comme déduplication de production. Le traitement métier s’exécute ensuite dans une file persistante.

Traiter deux niveaux distincts :

1. Idempotence du transport par provider + store + delivery_id, en détectant une collision d’identifiant avec corps différent.
2. Idempotence financière par provider + store + sale_id + benefit_type.

Une même vente peut produire plusieurs notifications légitimes. Elles restent traçables, mais un même avantage ne peut être attribué qu’une fois. Ne pas utiliser une seule déduplication par sale_id pour ignorer tous les événements métier ultérieurs, notamment révocation ou remboursement.

Utiliser l’événement du corps signé et les données relues côté API comme référence ; ne pas prendre l’en-tête d’événement non signé comme autorité indépendante. Les tests sans vente réelle validée n’attribuent jamais de crédits réels, même avec signature valide.

L’événement de succès documenté est successful.sale. failed.sale et abandoned.sale ne donnent aucun avantage. license.issued ne doit pas doubler l’attribution de successful.sale. Les événements d’expiration/révocation de licence concernent uniquement les droits rattachés à cette licence. Chariow prévoit cinq tentatives de livraison, puis peut désactiver le Pulse : surveiller son état et prévoir une alerte. [R5]

Ne pas inventer un événement payment.success, subscription.renewed ou refund.completed en l’absence de contrat officiellement vérifié. Les états internes peuvent utiliser d’autres noms, mais le mapping externe doit être explicite et testé.

Prévoir rotation du secret et gestion maîtrisée des livraisons anciennes : une éventuelle période d’acceptation de l’ancien secret est bornée, auditable et combinée aux contrôles de vente. Ne pas rejeter arbitrairement un rejeu légitime sur une fenêtre temporelle absente du protocole.

## 16. Vérification de vente et attribution atomique

Après webhook valide, relire la vente avec GET /v1/sales/{sale_id} via l’API Chariow. Le schéma distingue notamment les états de vente completed/settled et le statut de paiement success. Vérifier les données monétaires et le rattachement produit/commande avant attribution. Ne pas attendre le reversement marchand pour reconnaître un paiement client confirmé. [R6]

Contrôler : boutique attendue, environnement, identifiant de produit autorisé, vente connue ou commande retrouvée, référence opaque correspondant au compte enregistré, paiement effectif, devise, montant catalogue et réduction autorisée. Les métadonnées aident à retrouver la commande ; elles ne dictent jamais la quantité libre de crédits.

Ne pas comparer le net versé au marchand au prix payé par le client. Traiter les remises, frais, remboursements et conversions dans des champs distincts. Lire les valeurs numériques suivant le contrat réel, pas une hypothèse « montant en centimes ». Stocker XOF en entier, et les coûts USD dans une unité fixe exacte. Refuser les prix inconnus ou incohérents.

Une promotion à 100 % n’est acceptée que par une campagne explicitement autorisée et plafonnée. Un produit gratuit accidentel ne doit pas ouvrir le Pro. Par défaut, aucune remise arbitraire client ne change l’économie des forfaits.

Dans UNE transaction : verrouiller la commande/bénéficiaire, vérifier l’unicité du bénéfice, enregistrer le paiement, créer ou prolonger le droit, attribuer le lot immédiat applicable, planifier les allocations futures, marquer l’attribution et créer l’événement de synchronisation dans l’outbox.

Si deux ventes réellement payées sont retrouvées pour une même intention locale, ne pas effacer ni ignorer silencieusement la seconde. La placer en rapprochement pour traitement explicite : second renouvellement/recharge autorisé ou remboursement confirmé. Ne pas créditer aveuglément un avantage incompatiblement dupliqué.

Un webhook d’échec ancien n’annule pas un succès plus récent. Un événement de licence expirée ne révoque pas un abonnement renouvelé rattaché à une autre vente. Les transitions suivent la réalité métier vérifiée, pas le seul ordre d’arrivée.

## 17. Abonnements prépayés, cycles et changements d’offre

Lancement : accès mensuel ou annuel prépayé, renouvelé volontairement sur Chariow. Ne pas promettre de prélèvement récurrent tant que sa disponibilité, son contrat API et chaque moyen de paiement pertinent n’ont pas été confirmés et testés. Le système interne peut préparer cette évolution sans l’afficher comme active.

Calculer les dates en UTC et afficher selon le fuseau pertinent, par défaut Africa/Abidjan. Utiliser des mois calendaires avec ancrage d’origine conservé ; traiter les 29, 30 et 31 ainsi que les années bissextiles. Ne pas dériver progressivement un abonnement du 31 vers le 28 de tous les mois.

Pour un nouveau paiement confirmé traité normalement, la première allocation est immédiate. Si l’activation a été retardée par une panne, ne pas faire expirer avant livraison une période jamais fournie : conserver completed_at pour l’audit et appliquer une règle de début d’accès équitable, explicite et non manipulable par le client.

Un renouvellement anticipé du même forfait s’ajoute à la fin de la période déjà couverte. Aucun deuxième lot mensuel immédiatement distribué. Une vente annuelle programme exactement douze allocations sur la période, chacune unique par abonnement + début de cycle + type d’allocation.

Employer scheduler persistant et rattrapage idempotent au retour de l’utilisateur. Si le scheduler est en retard, attribuer le cycle dû sans doublon. Ne pas cumuler artificiellement les allocations expirées de plusieurs mois d’absence ; traiter séparément les compensations d’indisponibilité avérée.

Règle de simplicité V1 pour un changement entre deux offres payantes : prise d’effet à la prochaine échéance de l’accès déjà payé, date et montant affichés avant commande. Une recharge permet de continuer immédiatement. Ne pas simuler un prorata immédiat avec un champ de montant absent de l’API. Un futur upgrade immédiat nécessite un devis serveur, un mécanisme Chariow réellement supporté, un prorata des droits et crédits et une campagne de tests dédiée.

Pour un client déjà payant, adapter le bouton en « Programmer [offre] pour le [date] » lorsque la prise d’effet est différée ; ne pas lui promettre une activation immédiate.

Un passage du gratuit ou d’un accès expiré vers une offre payante est immédiat après confirmation. Le renouvellement d’un accès annuel n’écrase jamais les mois déjà acquis. Une rétrogradation conserve les documents existants et leur récupération ; elle ne fournit pas de nouveaux quotas rétroactifs.

Les crédits gratuits mensuels ne sont pas distribués pendant l’accès payant. Revenir au gratuit reprend le calendrier gratuit applicable sans nouvelle allocation de premier cycle ni rattrapage des mois passés en premium.

## 18. Mode Recharge sans abonnement actif

Permettre l’achat ponctuel de crédits à un utilisateur vérifié sans abonnement. Tant qu’un lot de recharge valide dispose de crédits disponibles ou engagés dans une tâche, un mode « Recharge » autorise les fonctions de génération Essentiel dans ses plafonds, mais pas PowerPoint/partage Plus ni narration Pro.

Texte : « Vous utilisez Limpid avec une recharge, sans abonnement actif. » Afficher séparément crédit, date d’expiration et fonctions disponibles. Ne pas afficher « Abonnement Essentiel actif » dans ce cas.

Une tâche valablement réservée avant épuisement garde les droits figés nécessaires à sa livraison. Dépenser le dernier crédit ne doit pas rendre son propre résultat inaccessible ou interrompre l’export prévu.

Lorsque la recharge est épuisée, retour aux droits gratuits pour les nouvelles opérations. Les contenus déjà générés restent récupérables. Un compte dépassant le plafond de stockage ou de rapports reçoit un avertissement AVANT l’achat : une recharge ne résout pas cette limite.

Aucune consommation, aucun renouvellement et aucune compensation ne transfèrent des crédits entre utilisateurs sans fonctionnalité commerciale explicitement prévue. Pas de marché de licences ou de revente de crédits implicitement créé.

## 19. Importations, actualisations et sécurité documentaire

Un import multiple est un lot identifié : attendre la fin ou la validation du lot avant une seule génération tarifée. Ne pas relancer l’analyse et la présentation à chaque arrivée de fichier. Annuler ou coalescer les traitements devenus obsolètes avant le prochain appel coûteux, sans effacer une tâche déjà livrée.

Le bouton d’import affiche par exemple « Créer mon rapport · 20 crédits ». Il vaut acceptation du devis correspondant. Une modification ultérieure de source affiche « Actualiser · 2 crédits » ou le tarif calculé avant engagement. Préserver l’automatisation utile sans dépenses invisibles. Pas de pop-up d’autorisation par sous-étape technique.

Conserver les anciens supports jusqu’à validation de la nouvelle version. Si le solde manque, montrer « À actualiser ». Une génération sur la version N des sources ne doit pas remplacer silencieusement une version N+1 produite entre-temps.

Les quatre approches existantes restent présentées simplement, idéalement en grille 2×2 : Très simple, Explication claire, Résumé fidèle, Révision active. Préférences dans un bouton dédié ; ne pas encombrer l’écran de paramètres économiques ou de modèles IA. Conserver la logique de recherche dynamique et le lecteur actuel. Glossaire et annexes déjà générés s’ouvrent dans leur lecture dédiée, sans nouvel appel payant au simple clic.

Contrôler extension, type réel, taille, pages, images décompressées, archives, temps CPU, espace temporaire et fichiers corrompus/protégés. Limiter les conversions de DOCX/PPTX et les PDF volumineux. Stockage privé, noms générés, URLs signées à durée limitée et suppression des fichiers temporaires. Scanner les fichiers lorsque l’infrastructure le permet. [R11]

Ne pas exécuter les instructions contenues dans une source comme des instructions système. Une phrase importée ne peut ni appeler un outil de facturation, ni changer un rôle, ni annuler les limites. La séparation de confiance est appliquée dans le code et les autorisations, pas seulement dans le prompt.

Assainir HTML/Markdown/SVG générés ; retirer scripts, événements et ressources externes arbitraires. Le moteur d’export ne doit pas permettre SSRF, accès aux métadonnées cloud ou lecture de fichiers serveur. Aucun accès réseau libre depuis un rendu de PDF non fiable.

Utiliser un projet/API de production adapté aux documents privés, avec politique de traitement vérifiée. Ne pas baser l’exploitation commerciale sur les crédits promotionnels fournisseur ni changer discrètement les conditions de traitement pour économiser. Prévoir suppression des sources, caches, index et fichiers fournisseur associés selon leurs politiques respectives.

## 20. Abus, budget global et observabilité

Mettre des garde-fous au niveau requête, workflow, utilisateur, gratuité, file d’attente et compte fournisseur global. Les plafonds concurrents tiennent compte des réservations déjà engagées, pas seulement des dépenses finalisées.

Limiter le débit des endpoints sensibles, le nombre de générations simultanées et la taille de file par compte. Recommandation de départ pour les nouvelles générations : 5 demandes/minute en gratuit, 10 en Essentiel, 20 en Plus, 30 en Pro, avec réponse claire et Retry-After ; ajuster après mesures. Les SSE et les lectures normales ne doivent pas être soumis au même compteur que les générations.

Les limites RPM/TPM fournisseur sont un problème distinct du solde utilisateur. Prévoir une file équitable, backoff avec jitter et absence de famine des petits forfaits. Ne pas faire payer une action qui n’a jamais pu démarrer à cause d’un quota fournisseur.

Lutter contre les comptes multiples : allocation gratuite seulement après vérification, contrôle de vélocité, signaux de risque proportionnés, CAPTCHA ciblé et vérification supplémentaire seulement si nécessaire. Ne pas considérer une IP comme une personne : écoles, campus et mobile money peuvent être partagés. Ne pas retirer une allocation déjà promise uniquement parce qu’une campagne a atteint son budget ; restreindre les nouvelles attributions annoncées pour l’avenir.

La réinscription, le changement d’email, le passage premium/gratuit ou une reconnexion sociale ne doivent pas régénérer l’allocation du premier cycle. Prévoir une politique de suppression/rétention minimale permettant les obligations de sécurité et de paiement sans conserver inutilement les documents personnels.

Réserver un budget d’acquisition distinct au gratuit. Au plafond de simulation retenu, 1 000 comptes gratuits consommant tout leur bonus de 80 crédits représentent 338 000 FCFA avec réserve, à chaque cycle mensuel (premier cycle compris). Ce sont des enveloppes, pas des dépenses mesurées. Comme l’allocation gratuite est désormais la même chaque mois, le coût du gratuit croît avec la base active : suivre la part de comptes gratuits actifs et le taux de conversion avant d’élargir l’acquisition.

Séparer chiffre d’affaires encaissé, reversements disponibles, engagements de crédits, mois d’accès restant dus et budget fournisseur financé. Un webhook Chariow n’alimente pas automatiquement le compte de facturation Gemini. Le préfinancement des crédits déjà vendus reste une responsabilité de Limpid. Les contrôles et données de facturation fournisseur ne remplacent pas l’enveloppe locale. [R7]

Prévoir seuils d’alerte à 60 %, 80 % et 95 % du budget interne applicable, et refus de nouvelles réservations au seuil de sécurité. Les tâches déjà acceptées doivent disposer de leur provision. Ne pas distribuer davantage de droits payants que la capacité financière et technique prévue permet d’honorer. Le seuil global ne doit pas rester une constante de test déconnectée du nombre d’abonnés.

Mettre en place un rapprochement persistant des commandes en attente, par exemple toutes les 15 minutes avec pagination, limites de débit et backoff. Réutiliser les identifiants de vente connus ; détecter les notifications perdues, les Pulses désactivés et les commandes restées incertaines. Après un seuil configurable de tentatives, alerter et passer en revue plutôt que recommencer à l’infini. Un délai local ne rend pas impossible une confirmation de paiement légitime plus tardive.

Les administrateurs voient : revenus brut/net, frais réels, crédits attribués/réservés/consommés/expirés, coût par modèle/action/offre, échecs, retries, usages inconnus, marge contributive, engagement annuel restant, budget gratuit, files, webhooks en échec et achats à rapprocher. Aucun document utilisateur intégral n’est nécessaire pour consulter la comptabilité.

Toute correction manuelle exige motif, opérateur, date et référence. Pas de modification directe et silencieuse de balance. Prévoir limites sur crédits promotionnels administrateur et alertes sur changements de rôles, prix ou politiques.

## 21. Modèle de données, endpoints et services

Réutiliser le modèle existant s’il garantit les mêmes invariants. Entités suggérées : users/profiles, roles, plan_versions, action_price_versions, entitlements, subscriptions, allocation_schedule, credit_lots, wallet_entries, credit_reservations, quotes, generation_jobs, generation_modules, provider_usage, payment_intents, payments, payment_benefits, webhook_inbox, outbox_events, audit_log.

Journal de crédits append-only avec écritures compensatoires. Un éventuel solde matérialisé est mis à jour dans la même transaction et réconciliable avec les écritures. Contraintes empêchant quantités négatives, consommations supérieures au lot, réservations contradictoires et restitution double.

Unicités minimales :

- identité fournisseur + identifiant utilisateur fournisseur ;
- compte + premier cycle gratuit ;
- abonnement + début de cycle + type d’allocation ;
- compte + clé d’idempotence d’action ;
- tâche + module + opération de solde ;
- fournisseur + boutique + livraison webhook ;
- fournisseur + boutique + vente + avantage.

Les enregistrements conservent les versions d’offre, de prix, de source et de modèle nécessaires. Les nouveaux tarifs ne changent pas rétroactivement un devis accepté, une allocation ou une durée déjà acquise. Avant toute hausse future du coût par action, analyser les engagements des crédits vendus et informer les utilisateurs selon la politique commerciale.

Interfaces applicatives proposées, à adapter aux routes existantes :

GET /api/me, /api/billing/catalog, /api/wallet, /api/wallet/history ; POST /api/generations/quote ; POST /api/generations ; GET /api/generations/:id ; POST /api/generations/:id/cancel ; POST /api/billing/checkout ; GET /api/billing/orders/:id ; POST /api/webhooks/chariow ; GET /api/events.

Chaque route privée vérifie l’identité et le propriétaire de l’objet. Ne pas accepter un user_id arbitraire pour sélectionner le portefeuille. Pagination et limites strictes sur les historiques. La réponse catalogue est publique et sans secrets ; les coûts fournisseur sont réservés à des endpoints admin distincts.

Services centraux typés : ensureUserBootstrap, getEntitlements, quoteAction, reserveCredits, settleModule, releaseReservation, grantCreditsOnce, expireLots, scheduleAllocations, computeProviderCost, initiateCheckout, verifyChariowWebhook, reconcileSale, fulfillPurchaseOnce, publishWalletEvent.

Prévoir workers persistants et ordonnanceur compatible avec le déploiement réel. Ne pas faire reposer une génération longue ou une attribution de paiement sur une promesse JavaScript lancée après la réponse HTTP dans une fonction éphémère. Une reprise de déploiement ne doit pas perdre le travail.

Variables serveur minimales, noms à adapter : AI_PROVIDER, GEMINI_API_KEY, GEMINI_ECONOMY_MODEL, GEMINI_REPORT_MODEL, GEMINI_VERIFY_MODEL, GEMINI_IMAGE_MODEL, GEMINI_AUDIO_MODEL, CHARIOW_API_KEY, CHARIOW_PULSE_SECRET, CHARIOW_STORE_ID, APP_BASE_URL, DATABASE_URL, secrets du worker, catalogue produits, budget API et budget gratuit. Ne mettre aucune clé API, clé service, secret Pulse ou mot de passe dans NEXT_PUBLIC_, les captures, le dépôt ou les logs.

## 22. Tests d’acceptation obligatoires

Produire des tests unitaires, d’intégration, de concurrence et de parcours mobile. Les tests simulés sont explicitement distingués des tests externes réels. Aucun achat réel de test sans autorisation et aucun secret réel dans les fixtures.

### Identité et accès

T01. Un nouvel inscrit devient user/free, jamais admin, même avec role=admin dans le payload.
T02. Le bootstrap répété dix fois n’attribue qu’une seule allocation de premier cycle (80 crédits).
T03. Un compte non vérifié ne peut dépenser ni payer sans le parcours requis.
T04. La réparation d’un profil manquant n’accorde pas une nouvelle allocation.
T05. Un utilisateur Pro ne peut accéder à aucune mutation admin.
T06. Un utilisateur A ne peut lire/modifier rapports, portefeuille, commandes, exports ou événements de B.
T07. Changement d’email, reset mot de passe et liaison OAuth ne multiplient pas les crédits.
T08. Logout, reconnexion sous un autre compte et cache navigateur n’affichent aucune donnée de l’ancien compte.

### Crédits et concurrence

T09. Deux demandes simultanées à 20 sur un solde de 30 ne réservent qu’une tâche.
T10. Un double clic réutilise la même tâche et le même débit.
T11. Rejouer une clé d’idempotence avec contenu différent est refusé.
T12. Le passage 600 → 580 disponibles + 20 réservés → 580 est exact.
T13. Un échec donne 600, sans double restitution au rejeu.
T14. Le streaming de texte ne génère aucun débit par mot ni double comptage API.
T15. Un retry fournisseur ne facture pas une seconde action.
T16. Un worker ancien ne peut solder après reprise avec nouveau fencing token.
T17. Une réservation active ne disparaît pas au seul passage d’un cron d’expiration.
T18. Une compensation technique après expiration ne permet pas une prolongation abusive répétée.
T19. La livraison partielle facture seulement les modules valides acceptés.
T20. Lecture, dossier et réexport existant n’appellent pas Gemini.
T21. Une « question » contenant une demande de rapport complet ne contourne pas la tarification.
T22. Le dernier crédit d’une recharge ne casse pas la livraison déjà autorisée.

### Cycles et offres

T23a. Un compte gratuit ne peut lancer un troisième rapport dans la même semaine glissante, même avec des crédits disponibles ; le message donne la date du prochain rapport possible.
T23. L’allocation du premier cycle gratuit n’est versée qu’une fois et ne se cumule avec aucune autre allocation gratuite du même cycle.
T24. Une allocation gratuite n’est pas ajoutée au cycle premium.
T25. L’achat annuel crée douze allocations, pas une allocation douze fois plus grande.
T26. Deux exécutions du scheduler ne doublent pas un cycle.
T27. Les ancrages du 31 janvier et du 29 février sont corrects.
T28. Renouvellement anticipé n’accorde pas une mensualité immédiate supplémentaire.
T29. Rétrogradation conserve sources, rapports et exports acquis.
T30. Une recharge n’active pas narration Pro ni durée d’abonnement.
T31. Un dépassement de stockage n’est pas présenté comme manque de crédits.
T32. Un changement de prix ne modifie pas un devis déjà accepté.

### Chariow

T33. Signature absente/invalide : aucun changement financier.
T34. Corps avec caractères accentués/URLs échappées : vérification sur octets bruts correcte.
T35. Test signé sans vente réelle : zéro crédit réel.
T36. Dix livraisons identiques : une attribution.
T37. Rejeu manuel avec nouveau delivery_id : toujours une attribution par avantage de vente.
T38. successful.sale puis license.issued : pas de deuxième lot.
T39. failed.sale ancien après succès : accès conservé.
T40. Licence ancienne expirée après renouvellement : nouveaux droits conservés.
T41. Produit, montant, devise, remise ou boutique inattendus : revue sans attribution.
T42. Page retour ?success=true falsifiée : aucune activation.
T43. Paiement success + vente settled reconnu sans attendre un second reversement.
T44. Webhook avant le retour checkout local ou après fermeture d’onglet : rattachement correct.
T45. API Chariow temporairement indisponible : état pending/review, pas de crédit supposé.
T46. Base indisponible à réception : pas de 2xx prématuré.
T47. Deux ventes payées pour une intention : aucune somme ignorée silencieusement.
T48. Compte différent au retour : aucun transfert automatique de l’achat.
T49. Achat hors session / métadonnée absente : récupération vérifiée.
T50. Remboursement confirmé rejoué : correction appliquée une seule fois.

### Moteur, qualité et sécurité

T51. Rapport long : aucune partie ignorée silencieusement pour tenir dans 20 crédits.
T52. Cibles de tokens mesurées sur exemples français réels et comparées aux budgets.
T53. Valeurs, unités, négations et citations restent fidèles après optimisation.
T54. OCR ciblé traite les scans, sans relire tout le document à chaque question.
T55. Plusieurs fichiers importés créent une seule opération de lot.
T56. Changement de source pendant génération ne publie pas un rapport obsolète comme version courante.
T57. Prompt injection dans PDF ne change ni rôle, ni quota, ni outils autorisés.
T58. SVG/HTML/PDF malveillant ne déclenche ni script ni accès réseau interne.
T59. Coût fournisseur inconnu apparaît « à rapprocher », pas 0.
T60. Image/audio/raisonnement/cache ne sont pas comptés deux fois.
T61. Budget global atteint empêche une nouvelle réservation sans perdre une tâche provisionnée.
T62. Déploiement pendant génération et webhook : travail repris sans double effet.
T63. Mobile 360 px, clavier ouvert, mauvaise connexion, retour de paiement et changement d’onglet : interfaces utilisables.
T64. Événements portefeuille désordonnés et reconnexion SSE : solde final correct.
T65. Limitation anti-abus n’exclut pas arbitrairement plusieurs utilisateurs d’un réseau partagé.

## 23. Déploiement et livrables attendus

Commencer par une sauvegarde et un état des lieux non destructif. Identifier les anciens crédits, unités, allocations et droits. Ne pas interpréter un ancien compteur de tokens API comme un solde de crédits Limpid. Produire un mapping de migration explicite, versionné et réexécutable sans duplication. Marquer correctement les allocations déjà accordées aux comptes existants afin que ensureUserBootstrap ne redistribue pas 80 crédits à toute la base après migration.

Déployer par étapes : schéma et rôles ; comptes gratuits ; journal/réservations ; moteur borné ; temps réel ; catalogue et écrans ; paiement de test ; rapprochement ; activation progressive. Utiliser des feature flags distincts pour nouvelles ventes, nouvelles inscriptions promotionnelles et nouvelles générations. Un incident paiement ne doit pas bloquer la lecture de la bibliothèque.

Mesurer les coûts avant/après sur un corpus représentatif : PDF texte, scans, graphiques, tableaux, documents longs et plusieurs sources. Évaluer coût médian et haut percentile, erreurs et fidélité, pas uniquement la moyenne des cas simples. La promotion commerciale « plus de générations » n’est validée que si le nouveau moteur tient le budget avec une qualité satisfaisante.

Livrer : modifications réellement exécutées, migrations et rollback, configuration tarifaire centralisée, contrats du registre, neuf produits Chariow à mapper/créer, variables manquantes, écrans et textes finalisés, tests et résultats, suivi des coûts, procédure de rapprochement et guide admin mobile.

Si une clé, une permission ou un accès externe manque, terminer les parties locales testables et indiquer précisément ce qui bloque l’étape externe. Ne pas inventer un paiement confirmé, un webhook fonctionnel, une fonctionnalité premium ou un test exécuté. Les endpoints de vente non configurés doivent échouer proprement plutôt que rediriger vers un faux checkout.

Objectif final : un nouvel utilisateur crée un vrai compte gratuit, reçoit une seule allocation de premier cycle, comprend ses limites, réserve une génération, voit son solde évoluer correctement, paie directement sur Chariow, reçoit une seule fois les bons crédits/droits et conserve ses documents même lorsqu’il n’a plus de quota.

## Références officielles de vérification

Les paramètres commerciaux, règles de produit, plafonds et tests sont des choix de cette spécification. Les références suivantes servent à vérifier les contrats externes, pas à présenter les choix de Limpid comme des exigences de Google ou Chariow. Documents consultés le 5 octobre 2026 ; vérifier leur version au moment de l’intégration.

[R1] Tarifs Gemini et dates d’effet :
`https://ai.google.dev/gemini-api/docs/pricing`

[R2] Métadonnées d’usage et comptage :
`https://ai.google.dev/api/generate-content`
`https://ai.google.dev/gemini-api/docs/tokens`
Réglages de raisonnement et cache :
`https://ai.google.dev/gemini-api/docs/thinking`
`https://ai.google.dev/gemini-api/docs/caching`

[R3] Checkout Chariow, champs et achats répétés :
`https://chariow.dev/api-reference/checkout/init-checkout`

[R4] Contrat de signature Pulse :
`https://chariow.dev/en/guides/pulse-security`

[R5] Événements, retries et rejeux Chariow :
`https://chariow.dev/en/guides/pulses`

[R6] Vérification de vente et bonnes pratiques Chariow :
`https://chariow.dev/api-reference/sales/get-sale`
`https://chariow.dev/en/guides/best-practices`
Tarification commerciale Chariow :
`https://chariow.com/en/pricing`

[R7] Facturation et limites Gemini :
`https://ai.google.dev/gemini-api/docs/billing`
`https://ai.google.dev/gemini-api/docs/rate-limits`

[R8] Référence de présentation des offres Gemini :
`https://gemini.google/subscriptions/`

[R9] Authentification :
`https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html`

[R10] Autorisations :
`https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html`

[R11] Import de fichiers :
`https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html`
