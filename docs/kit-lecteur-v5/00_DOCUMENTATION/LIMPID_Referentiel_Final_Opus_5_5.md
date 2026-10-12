# Limpid - Référentiel pédagogique et lecteur V5

Version 5.0.0 - 12 octobre 2026 - Directives pour Opus 5.5.

## 01. Décisions qui font autorité

Réponses utilisateur du 12 octobre 2026. Elles priment sur les propositions antérieures.

| Sujet | Règle finale |
| --- | --- |
| Ouverture | Chapitre complet en lecture continue. Tous ses sous-chapitres sont ouverts. |
| Repli dans le lecteur | Petit chevron en face du titre ; zone tactile de 44 px. Replier ou déplier une partie est une action de présentation. |
| Sommaire | Seul le chapitre courant est déplié au départ. Les autres restent repliés. |
| Explication | Explication et exemple utiles visibles ; seuls les détails secondaires sont repliables. |
| Repères | Jaune pour l’essentiel ; couleurs secondaires discrètes liées aux fonctions. |
| Icônes | Pictogrammes pleins et arrondis, avec intitulé. |
| Erreur | Correction ciblée, puis nouvelle question similaire proposée. |
| Interrogations | Dans le cours : uniquement en fin de chapitre. |
| Calculs | Étapes numérotées visibles, une opération principale par ligne, résultat final. |
| Reprise | Début du chapitre, avec objectifs et résumé. Résultats et historique conservés. |
| Progression | Séparer passages consultés, entraînements réussis et notions à revoir. |

Ce référentiel couvre le moteur pédagogique, la présentation, le lecteur, la révision et les exports associés. Il ne constitue pas un audit exécuté sur le dépôt de l’application. Les chemins cités sont ceux du PDF source ; Opus doit vérifier leur correspondance dans le dépôt.

## 02. Une structure commune au moteur et au lecteur

Cours > chapitre > sous-chapitre > blocs pédagogiques.

- STR-01. Un chapitre répond à une grande question. Son objectif décrit une capacité observable, pas un simple thème.
- STR-02. Un sous-chapitre explique une question, un mécanisme ou une application identifiable. Viser généralement 2 à 6 sous-chapitres par chapitre ; ce repère ne permet pas de supprimer du contenu.
- STR-03. Un bloc est un format interne : texte, exemple, condition, tableau, calcul, activité. Il ne devient pas automatiquement une étape du parcours.
- STR-04. Ne pas organiser tout le cours en catégories transversales « définitions », puis « analogies », puis « nuances ». Chaque élément reste près du raisonnement qu’il éclaire.
- STR-05. Titres et objectifs sont des champs structurés. Ne jamais retrouver la hiérarchie en analysant du gras dans un paragraphe.
- STR-06. Le nombre de chapitres suit la couverture pédagogique. Pour les sources longues, grouper visuellement des chapitres par thème ; ne pas fusionner automatiquement les deux plus courts pour respecter un plafond de 15.
- STR-07. Numérotation visible dérivée de l’ordre ; identifiants stables indépendants des numéros. Un déplacement ne casse pas les citations, questions ou résultats.

| Exemple de sous-chapitres | Rôle |
| --- | --- |
| Identifier les deux bases | Comprendre les termes et les données |
| Suivre le calcul | Observer une résolution complète |
| Interpréter le résultat | Comprendre la portée et les limites |

La longueur n’est pas une preuve de profondeur. Vérifier pour chaque objectif : explication suffisante, raisonnement utile, exemple ou représentation si pertinent, conditions essentielles.

## 03. Lire un chapitre entier sur téléphone

Comportement par défaut validé : lecture continue et sous-chapitres ouverts.

- LEC-01. À chaque ouverture explicite depuis la bibliothèque ou le sommaire : afficher le début du chapitre sélectionné, son objectif, ses repères essentiels, puis ses sous-chapitres ouverts.
- LEC-02. Le repli est conservé pendant la session de lecture en cours. Fermer une définition, une source, les options ou une question restaure cette session et sa position ; cela ne déclenche pas une nouvelle ouverture de chapitre.
- LEC-03. Le titre du sous-chapitre reste visible lorsqu’il est replié. Garder son numéro et, si utile, une courte indication d’objectif. Ne pas afficher une longue synthèse dans l’état replié.
- LEC-04. Une condition importante reste visible lorsque sa partie est ouverte. Le repli volontaire de toute la partie est autorisé ; un détail secondaire ne peut pas servir à dissimuler cette condition.
- LEC-05. Afficher le chapitre courant dans l’en-tête. La position peut préciser le sous-chapitre actif, sans présenter le défilement comme une preuve de maîtrise.
- LEC-06. « Sommaire · Question · Options » reste la navigation du lecteur. Prévoir la place réelle de la barre et la zone système du téléphone. Aucun dernier paragraphe ou bouton ne passe dessous.
- LEC-07. Pas de bouton Continuer après chaque bloc. Une action « Chapitre suivant » apparaît après la fin du chapitre ; le quiz peut être passé et n’empêche pas la lecture.
- LEC-08. La génération progressive ne remplace pas brutalement la partie sous le doigt. Réserver l’espace des visuels et signaler le contenu encore en préparation.

Retour au début du chapitre ≠ remise à zéro des résultats. Les données de progression et les réponses sont sauvegardées séparément de la position d’affichage.

## 04. Sommaire et contrôles de repli

Une hiérarchie accessible, avec une seule action prévisible par contrôle.

- NAV-01. À l’ouverture du sommaire, déplier le chapitre courant uniquement. Déplier un autre chapitre ne ferme pas automatiquement le premier : l’utilisateur peut comparer deux groupes.
- NAV-02. Le chevron indique ouvert ou replié. Taille visuelle 16 à 20 px, zone tactile 44 × 44 px. Intitulé accessible : « Replier [titre] » ou « Déplier [titre] ». Ne pas dépendre de la couleur.
- NAV-03. Un contrôle distinct permet d’aller au chapitre ; le chevron sert à afficher sa liste. Éviter un même clic ambigu qui navigue et déplie simultanément.
- NAV-04. Dans le sommaire, « Tout déplier » et « Tout replier » agissent sur les groupes de chapitres. Dans le lecteur, « Tout déplier » et « Tout replier » agissent sur les sous-chapitres du chapitre actuel. Libellé et portée doivent être explicites.
- NAV-05. Choisir un sous-chapitre ferme le sommaire, ouvre cette partie si nécessaire, puis positionne son titre sous l’en-tête. Un lien direct doit aussi déplier ses ancêtres.
- NAV-06. Bouton + aria-expanded + aria-controls, ou élément details/summary natif. Activation au clavier, focus visible et ordre logique. Si une partie contenant le focus est repliée, ramener le focus sur son contrôle.
- NAV-07. Le sommaire mobile peut être une feuille modale scrollable. Fermeture explicite, fermeture par Échap, gestion du focus et retour au bouton déclencheur.
- NAV-08. Les états consulté/réussi/à revoir ne sont pas les chevrons. Un sous-chapitre replié n’est pas terminé.

Grouper / dégrouper signifie ici replier / déplier l’affichage. L’ordre, la structure du cours et ses références ne sont pas modifiés.

## 05. Parties pédagogiques et proximité

Les parties servent l’explication ; elles ne deviennent pas un moule obligatoire.

| Partie | Contenu et affichage |
| --- | --- |
| Ouverture | Titre précis + une phrase d’objectif. Aucun long préambule. |
| L’essentiel | Généralement 3 puces au début du chapitre ; repère souple de 60 mots au total. Les conditions centrales restent présentes. |
| Explication | Texte sur le fond du lecteur ; paragraphes d’une idée. Ne pas enfermer chaque paragraphe dans une carte. |
| Définition | Terme exact + sens dans ce contexte + exemple si utile. Définir immédiatement les prérequis nécessaires. |
| Important | Idée déterminante. Viser 1 à 2 encadrés par chapitre, sans limiter les avertissements nécessaires. |
| Exemple | Situation, application, résultat. Mention « Exemple pédagogique » si fictif. |
| Analogie | Relation expliquée, correspondances, limite. Facultative. |
| Condition / nuance | Près de l’affirmation concernée. Conclusion courte visible ; développement supplémentaire possible à côté. |
| À ne pas confondre | Deux notions ou deux raisonnements explicitement distingués. |
| Approfondissement | Détail secondaire repliable ; titre indique ce qu’on y trouve. |
| À retenir | 2 à 4 idées en fin de chapitre : restitution attendue, sans recopier l’ouverture. |
| Vérification | Après tous les sous-chapitres : petite séance d’entraînement. |

Ne pas imposer un exemple, une analogie et un graphique à chaque notion. Choisir le format qui réduit une difficulté réelle.

## 06. Typographie, puces et rythme

Valeurs du lecteur en pixels CSS. Une résolution JPG ne permet pas de mesurer la police du site.

| Élément | Base |
| --- | --- |
| Texte courant | 16 px ; interligne 1,55 ; réglage utilisateur autorisé |
| Titre de chapitre | 24 à 28 px ; maximum visuel souple de 3 lignes |
| Sous-chapitre | 20 à 22 px ; titre court et précis |
| Titre de bloc | 16 px ; graisse 600 |
| Secondaire / légende | 13 à 14 px ; ne porte pas seul une information essentielle |
| Marges / espaces | 16 à 20 px latéraux ; 12 à 16 px entre paragraphes ; 24 à 32 px entre parties |

- TXT-01. Police UI sans sérif disponible, conforme au kit existant ; pas de nouvelle dépendance distante obligatoire. Texte aligné à gauche, pas de justification.
- TXT-02. Viser 2 à 4 phrases par paragraphe et 30 à 70 mots lorsque cela convient. Scinder par idée, jamais au milieu d’un calcul ou d’une condition.
- TXT-03. Une liste à puces contient des éléments parallèles ; une liste numérotée décrit un ordre réel. Puce ronde discrète, retrait court, espace régulier. Pas d’emoji comme puce.
- TXT-04. Éviter plus d’un niveau d’imbrication dans la lecture mobile ; convertir les sous-listes longues en parties titrées.
- TXT-05. Gras sur les termes discriminants et conclusions. Pas de paragraphe entier en gras ; pas de longues phrases en majuscules.
- TXT-06. Une seule colonne. Sur écran large, limiter la largeur du texte ; garder un ordre de lecture identique. Les options de taille s’appliquent aussi aux composants.
- TXT-07. Respecter l’agrandissement, l’espacement personnalisé, les longues langues et le thème sombre. Un budget de hauteur ne permet pas de tronquer du contenu.

## 07. Couleurs et pictogrammes

Palette issue du kit UI V4, complétée pour le lecteur.

| Fonction | Surface claire / texte | Pictogramme |
| --- | --- | --- |
| Essentiel / Important | #FFF5CB / #142018 | essential / important |
| Définition | #DCEAE0 / #234834 | definition |
| Exemple | #EAF2FA / #244E70 | example |
| Analogie | #F1EBFA / #5A4378 | analogy |
| Condition / nuance | #FFF1D4 / #775310 | caution |
| Erreur de réponse | #F9E9E3 / #A63728 | review |
| Réussite | #E0EFE3 / #2F6846 | success |
| Calcul / tableau / source | Surface neutre / #142018 | calculation / table / source |

- VIS-01. Jaune de marque #F8D94B : action principale et repère essentiel. Le fond général est #F8F7F2 et le texte #142018. Utiliser les tokens, pas des couleurs disséminées dans les composants.
- VIS-02. Les pictogrammes sont pleins et arrondis, grille 24 × 24, affichés généralement à 20 px. Ils accompagnent un intitulé ; une icône seule n’explique pas un type pédagogique.
- VIS-03. Couleur + intitulé + forme : aucun état ne dépend exclusivement de sa teinte. Le rouge marque une erreur réelle, pas toute réserve documentaire.
- VIS-04. Navigation et données restent sobres. Pas de couleur différente pour chaque paragraphe ni d’animation décorative permanente.
- VIS-05. SVG avec currentColor, sprite optionnel. Le texte et les boutons restent HTML. Ne pas convertir une bannière, un nombre ou une carte en image.

Les variantes sombres sont fournies dans reader.tokens.json. Contrastes vérifiés pour les couples texte/surface ; ils devront être revérifiés si une couleur est modifiée.

## 08. Formules et calculs lisibles

Les étapes du calcul restent visibles, conformément au choix utilisateur.

- CAL-01. Séparer la formule générale, ses symboles et l’application numérique. Rendu mathématique HTML/MathML ou bibliothèque déjà présente ; alternative textuelle.
- CAL-02. Pour une résolution : données de départ, étapes numérotées, une opération principale par ligne, courte justification et résultat avec unité.
- CAL-03. Ne pas concaténer plusieurs opérations avec des points-virgules dans un grand bloc monospace. Un enchaînement doit garder son ordre logique.
- CAL-04. Définition de variable : libellé et valeur courte sur la même ligne si la largeur suffit ; sinon valeur et description empilées. Aucune colonne étroite ne doit couper « action » lettre par lettre.
- CAL-05. Valeur et unité courte restent ensemble : 25 %, 8 €, 2 kg. Une unité longue passe sur une ligne lisible. Conserver unité, précision et conditions de la source.
- CAL-06. Une formule trop longue est découpée aux égalités ou opérateurs selon son sens. En dernier recours : débordement limité à la formule, jamais à toute la page.
- CAL-07. Calculer les résultats par le code à partir des données validées. Vérifier unités, division par zéro, domaines et arrondis. Un résultat dérivé n’a pas besoin d’apparaître littéralement dans la source, mais sa dérivation doit être justifiée.
- CAL-08. Simulation facultative : données originales visibles, champs avec unité, valeurs modifiées signalées, résultat local et bouton Restaurer. Ne pas inventer une plage de variation qui ferait croire à une relation absente de la source.

Les chiffres du lecteur de démonstration constituent un cas fictif. Ils ne décrivent aucun taux fiscal réel.

## 09. Tableaux et comparaisons

Conserver les relations entre données, sans sacrifier la lisibilité.

- TAB-01. Titre ou caption précis. En-têtes de colonnes, en-têtes de lignes et unités identifiables. Valeurs numériques alignées ; descriptions alignées à gauche.
- TAB-02. Viser 2 à 3 colonnes sur téléphone quand le sens le permet. Ne pas réduire la police pour faire tenir un tableau conçu pour ordinateur.
- TAB-03. Si la comparaison exige plusieurs colonnes : conteneur horizontal local, première colonne repérable et indication « Faire défiler le tableau ». Aucun défilement horizontal du texte environnant.
- TAB-04. Les cartes verticales sont une alternative uniquement si chaque valeur conserve son critère, son unité et son entité. Ne pas disperser une comparaison indispensable.
- TAB-05. Donnée absente = « Non renseigné » ou tiret légendé ; pas 0. Unité commune dans l’en-tête si elle s’applique vraiment à toutes les valeurs.
- TAB-06. Tableaux longs : regroupement par sections ou affichage additionnel explicite « Voir les autres lignes ». Le total et le nombre de lignes disponibles restent connus.
- TAB-07. Pas de quadrillage lourd ; séparateurs horizontaux sobres. La couleur peut souligner un résultat, avec un libellé qui conserve le sens en impression monochrome.
- TAB-08. En PDF : répéter les en-têtes, conserver une ligne entière sur une page lorsque possible. Adapter largeur ou orientation locale si nécessaire, sans diminuer excessivement la police.

Le repli d’un détail ne peut pas retirer une ligne qui change la conclusion. Une vue compacte annonce clairement ce qui reste accessible.

## 10. Graphiques adaptés au mobile

Titre, axes et unités, données, interprétation, alternative textuelle.

| Format | Usage et adaptation |
| --- | --- |
| Barres | Comparer des catégories. Horizontales pour les noms longs ; origine normalement à zéro. |
| Courbe | Évolution ordonnée. Garder les intervalles ; rupture pour une valeur absente. |
| Composition | Barre empilée ou secteurs pour quelques parts d’un total connu. |
| Nuage de points | Deux variables ; axes et unités, détails au toucher. |
| Histogramme | Distribution : bornes des classes et effectifs explicites. |

- GRA-01. Recalculer la mise en page selon la largeur et la taille du texte. Ne pas réduire un SVG desktop jusqu’à rendre ses labels minuscules.
- GRA-02. Réduire le nombre de graduations avant la police ; viser 3 à 5 repères horizontaux sur petit écran selon leurs labels. Réserver l’espace des plus longues étiquettes.
- GRA-03. Conserver les données. Une catégorie cachée, un filtre, une échelle tronquée ou une agrégation est signalé. Aucun tri qui déforme une chronologie.
- GRA-04. Courbes multiples : légende compacte, couleurs et motifs distincts. Au-delà de quelques séries, proposer une sélection locale ou de petites vues coordonnées.
- GRA-05. Détails accessibles au toucher et au clavier ; pas d’information réservée au survol. En fin de graphique, expliquer ce qu’il montre et ce qu’il ne démontre pas.
- GRA-06. Données exactes et calculs produits par le code. Alternative en tableau ou texte, également disponible à l’export. Pas de graphique de données confié à une image raster générée.

Ne pas confondre succession, corrélation et causalité. Le choix d’un graphique ne doit pas renforcer une conclusion que la source ne soutient pas.

## 11. Schémas, frises, images et procédures

Chaque représentation doit résoudre une difficulté identifiée.

- SCH-01. Schéma de mécanisme : objets, relations et sens des flèches explicites. Orientation verticale sur mobile ; découpage en groupes si nécessaire, avec vue d’ensemble accessible.
- SCH-02. Les étiquettes sont du texte lisible, proche des objets. Préférer SVG/HTML structuré pour les relations et annotations exactes. Un prompt correct ne garantit pas le résultat d’une image IA.
- SCH-03. Frise verticale : date ou période, événement et explication courte. Conserver les incertitudes et distinguer ordre narratif et chronologique.
- SCH-04. Procédure : verbe d’action, entrée nécessaire, action et résultat attendu. Aucune étape obligatoire supprimée ; ordre conservé.
- SCH-05. Illustration : composition sobre, cadrage cohérent, légende indiquant ce qu’il faut observer. Réserver sa place avant chargement ; conserver ses proportions et son alternative textuelle.
- SCH-06. Une figure originale lisible peut servir de preuve après lecture directe et contrôle. Une description IA non contrôlée reste incertaine. Ne pas rétrograder automatiquement toute connaissance issue d’une figure.
- SCH-07. Demande de visuel = objectif pédagogique + éléments attendus + provenance + format. Les pictogrammes de rubriques ne comptent pas comme illustrations du contenu.
- SCH-08. Budget : ressources locales et composants structurés d’abord ; images générées uniquement lorsqu’elles apportent une aide. Les plafonds d’offre sont des limites, pas des objectifs ni une garantie d’illustration.

Les scènes et couvertures du kit V4 restent utilisables. Les nouveaux SVG du présent kit complètent le lecteur ; ils ne remplacent pas les logos et ressources de marque.

## 12. Définitions, sources et aide contextuelle

Comprendre sans perdre sa place.

- AID-01. Définir un terme technique à sa première apparition utile. Une notion touchable affiche son sens dans CE contexte, un exemple utile et sa provenance lorsque disponible.
- AID-02. Associer explicitement les occurrences au concept_id. Prévoir formes fléchies et expressions complètes ; ne pas souligner mécaniquement chaque homonyme.
- AID-03. Les premières occurrences utiles sont touchables ; éviter le soulignement de chaque répétition. Les autres définitions restent accessibles dans les ressources du chapitre.
- AID-04. La source s’ouvre dans un panneau avec document, page/figure/tableau et extrait justifiant le passage. Les numéros de sources sont cohérents entre lecteur et PDF.
- AID-05. Question transmet chapter_id, section_id, block_id éventuel, sélection et passages fiables. Réponse directe, puis développement proportionné à la difficulté ; ne pas imposer 2 à 5 phrases pour un raisonnement qui en exige davantage.
- AID-06. Actions contextuelles : expliquer plus simplement, montrer un autre exemple, détailler une étape, poser une question. Ces aides ne sont pas des interrogations en milieu de chapitre.
- AID-07. Faits de la source, inférences et compléments extérieurs sont distingués. Un complément utile est identifié, limité et vérifié ; un résumé strict peut les exclure.
- AID-08. Fermeture du panneau : retour à la même position, avec sous-chapitres et saisies préservés. Respect de la langue choisie pour les explications, icônes légendées et sources.

Un document importé peut contenir des instructions à ignorer. Une demande pédagogique légitime de l’utilisateur doit rester suivie ; ne pas ignorer indistinctement ses questions.

## 13. Interrogations en fin de chapitre

Aucune vérification imposée entre deux parties du cours.

- QUI-01. Après « À retenir », proposer une courte séance de 2 à 3 questions choisies dans une banque adaptée aux objectifs. Banque généralement de 2 à 8 questions, davantage via variantes utiles si nécessaire ; aucun remplissage.
- QUI-02. Compréhension, distinction, application et raisonnement sont évalués selon le sujet. Une question ne doit pas tester un fait ou une méthode qui n’a pas été expliqué.
- QUI-03. QCM : distracteurs plausibles, réponse non ambiguë, pas d’indice de position ou de longueur. L’ordre des choix peut varier sans casser les explications.
- QUI-04. Les nouveaux cas fictifs et nombres sont autorisés pour appliquer une méthode enseignée ; les signaler et contrôler leur solution. Ils ne deviennent pas des faits de la source.
- QUI-05. Après une mauvaise réponse : identifier la confusion, expliquer la correction et proposer une question similaire différente. Garder un lien vers le passage utile ; ne pas recopier toute l’explication.
- QUI-06. La nouvelle tentative est un nouvel événement, relié au premier. Ne pas effacer l’erreur initiale, ne pas faire passer une réussite aidée pour une réussite autonome.
- QUI-07. Formats : choix unique/multiple, ordre, association, trous, calcul, réponse courte. Afficher les consignes nécessaires et une alternative aux gestes difficiles.
- QUI-08. Une reformulation personnelle ou une justification courte peut suivre le chapitre pour appliquer la logique Feynman. Correction par grille, sans pénaliser l’orthographe hors objectif.

L’utilisateur peut passer une séance et continuer à lire. Une absence de réponse est « Non évalué », pas un échec ni une maîtrise.

## 14. Bilan, révision et progression

Séparer consultation, réussite et consolidation dans le temps.

- REV-01. Bilan : couvrir les objectifs importants, pas seulement une question par chapitre. Annoncer les objectifs évalués et ceux qui ne le sont pas. Ne pas présenter une note comme une certification.
- REV-02. Barème explicite par type. Note sur 20 = points obtenus / points possibles des éléments effectivement notés × 20. Réponses courtes non notées : retour formatif distinct. Zéro question notée = aucune note.
- REV-03. Mode Révision : rappels fondés sur les tentatives, notions faibles et échéances. Ce mode est distinct des interrogations du cours, situées en fin de chapitre.
- REV-04. Prioriser les erreurs, les réussites aidées, les rappels dus et les objectifs peu évalués. Varier les situations pour éviter la mémorisation d’une option.
- REV-05. Intervalles adaptés au délai visé et aux résultats. Tout calendrier initial est un paramètre produit à tester, pas une loi universelle. Réutiliser la banque ; pas d’appel IA à chaque ouverture.
- PRO-01. Trois dimensions séparées : passage consulté, entraînement réussi, notion à revoir. Elles peuvent coexister. Replier, défiler ou ouvrir un chapitre ne valide aucune compétence.
- PRO-02. Consultation : enregistrer un passage effectivement affiché ; objectif technique initial configurable de 2 secondes de visibilité, hors onglet masqué. C’est une observation d’usage, pas la preuve qu’il a été lu.
- PRO-03. Réussite : conserver résultat, objectif, question, aides, première tentative et date. Consolidation estimée seulement après plusieurs réussites autonomes sur variantes et au moins un rappel différé.

La reprise au début du chapitre conserve ces trois dimensions. Les changements de contenu invalident uniquement les résultats portant sur des objectifs ou questions réellement modifiés.

## 15. Comprendre la source avant de rédiger

Fidélité, couverture et prérequis sont contrôlés séparément.

- SRC-01. Conserver documents, pages, segments, figures, tableaux, qualité d’extraction et provenance. Découper selon les limites sémantiques ; 12 000 caractères peut être une cible technique, pas une coupure aveugle.
- SRC-02. Prévoir le contexte de chevauchement nécessaire, notamment pour tableaux et réserves. Dédupliquer avec identifiants et sens ; ne pas fusionner les homonymes par nom seul.
- SRC-03. Extraits exacts vérifiés dans le segment original. Nombres structurés : valeur, unité, contexte, écriture source. Reconnaître les équivalences licites sans accepter une substitution de données.
- SRC-04. Second jugement confronté aux passages pertinents. Un désaccord conduit à une vérification ciblée, pas seulement à un classement automatique vers le pire statut.
- SRC-05. Une assertion soutenue par la source n’est pas une vérité expertisée extérieurement. Les contradictions entre documents sont examinées selon contexte, période et unité avant d’être qualifiées.
- SRC-06. Couverture à trois niveaux : zones de source exploitées ou indisponibles ; notions/objectifs importants pris en charge ; contenu effectivement enseigné et activités associées.
- SRC-07. Prérequis manquants : indiquer le manque et, si utile, ajouter un complément explicite et contrôlé. Ne pas annoncer « aucun prérequis » puis interdire toute aide extérieure.
- SRC-08. Carte de couverture reliant objectifs, concepts, affirmations, preuves, sections et questions. Une omission centrale doit bloquer le statut complet.

Les passages illisibles sont signalés. Une source partiellement exploitable peut donner un cours partiel clairement délimité ; elle ne doit pas être présentée comme entièrement couverte.

## 16. Rédaction, contrôles et publication

La sécurité factuelle minimale reste identique pour toutes les offres.

- GEN-01. Rédiger selon le plan validé, avec vocabulaire commun et prérequis explicites. Les rédactions parallèles sont suivies d’un contrôle global des transitions, définitions et contradictions.
- GEN-02. Chaque objectif est expliqué au bon endroit ; références existantes ne suffisent pas à démontrer que le texte est conforme. Associer contrôles structurels, contrôles numériques et jugement sémantique ciblé.
- GEN-03. Les chiffres, conditions et exceptions importants restent présents. Accepter une normalisation documentée de notation ; calculer les résultats dérivés séparément.
- GEN-04. Défaut bloquant : contradiction factuelle, citation inexistante, calcul faux, omission centrale ou contenu illisible. Un chapitre qui en conserve un n’est pas publié comme utilisable.
- GEN-05. Réparation limitée et traçable, puis nouvelle validation. Après échec, conserver le brouillon dans les traitements internes et publier seulement les parties sûres ou une ancienne version acceptée.
- GEN-06. Publication progressive : chapitres acceptés dans un ordre pédagogique continu. Statuts distincts : en préparation, disponible partiellement, complet avec contrôles automatiques réussis, échec ciblé.
- GEN-07. Ne pas utiliser « Vérifié » comme garantie absolue. Afficher ce qui a été contrôlé et les limites restantes.
- GEN-08. Idempotence des étapes, versions et tentatives. Une reprise ne refacture pas deux fois l’utilisateur pour le même travail accepté ; ne pas promettre que toute reprise technique coûte zéro au fournisseur.

Les plafonds de réparation, budgets d’images et modèles sont dans un registre configurable. Aucun nom commercial de modèle du PDF source n’est une dépendance obligatoire du référentiel.

## 17. Contrat de données et rendu

course.schema.json, reader.rules.json et contrats TypeScript accompagnent ces directives.

| Objet | Champs ou responsabilités |
| --- | --- |
| Cours | schema_version, content_version, langue, sources, limites, chapitres |
| Chapitre | id stable, titre, objectif, essentiel, sections, à retenir, quiz de fin |
| Sous-chapitre | id, titre, objectif, blocs ; ordre indépendant de l’identifiant |
| Bloc | id, kind, texte/charge utile, références, statut et rôle visuel |
| Représentation | Données, unités, légende, description accessible et provenance |
| Question | Objectif, réponse/correction, variante, passage à revoir |
| Tentative | Question/version, résultat, aides, horodatage et tentative précédente |
| Session UI | Chapitre actif, replis temporaires, sélection et position lors des panneaux |

- DAT-01. Le serveur livre la structure pédagogique. Le lecteur choisit la disposition selon largeur et préférences sans appeler l’IA pour plier, déplier, changer le thème ou afficher un tableau.
- DAT-02. Les champs de texte sont rendus comme texte ou Markdown limité, sans HTML arbitraire importé. Les données source ne pilotent pas les actions du lecteur.
- DAT-03. Les codes kind ont une table de composants unique. Un format inconnu donne un état explicite et une trace de validation ; pas de disparition silencieuse.
- DAT-04. Les scores calculés et les valeurs de composant proviennent des données validées et du code. Les libellés sont traduisibles ; la langue s’applique aussi aux graphiques et au chat.

Le schéma est un contrat d’échange, pas un substitut au contrôle sémantique. Les exemples synthétiques du kit sont identifiés demo=true et ne doivent pas devenir un cours réel.

## 18. Assets et composants à intégrer

Formats natifs réutilisables, avec textes et interactions pilotés par le code.

| Dossier | Livrables et usage |
| --- | --- |
| 00_DOCUMENTATION | PDF, référentiel Markdown, prompt Opus et correspondance des règles |
| 01_DESIGN | Tokens JSON, CSS et configuration des comportements |
| 02_ICONS | 26 SVG originaux et sprite : rubriques, navigation et progression |
| 03_COMPONENTS | CSS du lecteur, contrats TypeScript et fragments HTML accessibles |
| 04_EXAMPLES | Lecteur autonome, cours JSON synthétique et source fictive |
| 05_QA | Guide de recette, validation locale et résultats des contrôles |

- AST-01. SVG : pictogrammes, chevrons, schémas vectoriels exacts. HTML/CSS : boutons, encadrés, bannières, listes, panneaux, quiz et graphiques calculés.
- AST-02. Les PNG de contrôle et pages PDF illustrées sont des aperçus. Ne pas les utiliser comme composants de production.
- AST-03. Brancher currentColor pour les icônes inline/sprite ; pour une balise img, choisir une coloration explicite ou garder la couleur du fichier. Ne pas attendre qu’un SVG externe hérite automatiquement du texte.
- AST-04. Les variables --lr-* et la classe lr-reader sont limitées au lecteur. Réutiliser les tokens V4 de marque ; ne pas imposer ces styles à l’administration ou à l’accueil.
- AST-05. Les références Drive servent à retrouver et télécharger les fichiers. Copier les ressources utiles dans le projet ; ne pas utiliser une page Drive comme URL d’asset de production.

Dossier cible : LIMPID_Lecteur_Pedagogique_V5_Opus_5_5, sous le dossier Limpid. L’archive conserve la même arborescence et sert au transfert complet.

## 19. Migration et ordre d’implémentation

Intégrer dans l’existant avec un adaptateur, puis activer après recette.

- IMP-01. Opus commence par lire ce référentiel, le prompt, reader.rules.json et course.schema.json. Identifier moteur V5/V6, contrats, composants et export actuels ; décrire les écarts réels.
- IMP-02. Phase 1 : tokens, pictogrammes et nouveau lecteur derrière un indicateur de fonctionnalité. Adapter un cours existant sans relancer sa génération.
- IMP-03. Phase 2 : chapitre/sections/blocs. Créer un adaptateur pour les anciens blocs, conserver identifiants de preuves et version de contenu. Ne pas confondre une migration UI avec une réextraction.
- IMP-04. Phase 3 : modifier les consignes du plan et des chapitres pour produire des sous-chapitres sémantiques. Mettre à jour contrôles, réparations et publications.
- IMP-05. Phase 4 : quiz en fin de chapitre, remédiation par variante, progression séparée, reprise au début du chapitre et rappels.
- IMP-06. Phase 5 : export PDF et exercices, langue, accessibilité, petits écrans et contenus longs. Les sous-chapitres sont toujours développés à l’export.
- IMP-07. Avant activation : tester cas simples et difficiles, ancien cours, source scannée, données manquantes et erreurs de génération. Conserver une possibilité de revenir au rendu antérieur.
- IMP-08. Les modifications de faits ou de sources déclenchent une nouvelle vérification ciblée et la mise à jour des blocs/questions dépendants. Une affirmation ancienne validée peut être réouverte si l’utilisateur signale une erreur.

Livraison attendue d’Opus : changements réellement effectués, migrations, contrôles exécutés, limites restantes et démonstration des critères d’acceptation.

## 20. Recette du lecteur

Critères observables ; ne pas valider uniquement avec une capture agréable.

| Cas | Résultat requis |
| --- | --- |
| Ouverture et reprise | Début du chapitre, objectifs visibles, tous les sous-chapitres ouverts ; historique préservé |
| Chevron | Repli/dépli par souris, toucher et clavier ; libellé, focus et état cohérents |
| Sommaire | Chapitre courant ouvert ; lien vers une partie la déplie et positionne son titre |
| Petits écrans | 320/360/390/430 px ; pas de débordement global ni texte masqué |
| Texte agrandi | 200 % et espacement personnalisé : contenu et actions accessibles |
| Formule longue | Découpe sémantique ou zone locale ; unité et symbole lisibles |
| Tableau large | Défilement limité au tableau ; en-têtes et valeurs compréhensibles |
| Quiz | Uniquement en fin de chapitre ; correction ciblée et variante proposée |
| Progression | Consultation, réussite et à revoir séparés ; repli sans effet de validation |
| Panneaux | Retour au passage et aux saisies ; focus restauré |
| PDF | Sous-chapitres développés ; données, conditions et sources présentes |

- QA-01. Tester thèmes clair/sombre, langue française/anglaise, longs titres, réseau lent, image indisponible et génération partielle.
- QA-02. Contrôler contenu chiffré et graphique avec les valeurs exactes et les valeurs dérivées ; tests négatifs sur division par zéro, preuve inconnue et source partielle.
- QA-03. Les assertions structurelles peuvent être automatisées. La profondeur pédagogique et la conformité sémantique nécessitent des cas évalués et une revue ciblée.

Le kit contient une validation locale des fichiers et un guide de recette application. L’intégration et sa validation dans Limpid restent à exécuter par Opus sur le dépôt réel.

## 21. Correspondance avec les règles du PDF source

La présente version prime dans son périmètre ; conserver la traçabilité des modifications.

| Règles existantes | Modification à appliquer |
| --- | --- |
| R1.1 / R3.7 / complement | Faits source séparés des compléments utiles identifiés et contrôlés |
| R1.3 / R3.8 | Désaccord vérifié contre le passage original, pas seulement classement prudent |
| R2.2 / R3.6 | Découpage sémantique et traitement direct des figures/tableaux |
| R4.3 / R4.4 / R4.6 | Sous-chapitres explicites ; couverture source/objectifs/contenu ; pas de fusion aveugle |
| R5.3 / R5.4 / R7.6 | Boucle comprendre-expliquer-appliquer-corriger ; profondeur plutôt que quota de mots |
| R5.6 / R6 | Titres structurés, composants mobiles et définitions contextuelles |
| R6.1 / R7.5 | Valeurs originales ou dérivées contrôlées ; un paragraphe ne répare pas une erreur |
| R7.9 / R7.10 | Pas de brouillon bloquant publié ; statut de contrôle limité et explicite |
| R8 / A.6 | Quiz de cours en fin de chapitre ; variantes fictives licites ; barème et rappels |
| R9 / R4.10 | Visuels motivés ; schémas exacts structurés ; politique d’images commune |
| R10.2 / R10.3 / R10.4 | Lecture continue ouverte, replis, sommaire et progression séparée |
| R10.6 / Partie 11 / A.7 | Export adapté ; erreur source réexaminée ; langue et aide contextuelle cohérentes |

Annexe A.5 du PDF source : passage interrompu dans la règle des variantes. Ne pas recopier cette troncature. Régénérer les consignes à partir des contrats et règles complets du présent kit.

## 22. Sources, portée et transmission

Références utiles pour comprendre les choix ; aucune promesse clinique.

- Base documentaire : Limpid_Regles_Enseignement_Presentation.pdf, état annoncé au 11 octobre 2026, 22 pages ; cinq captures du lecteur fournies par l’utilisateur ; décisions QCM du 12 octobre 2026.
- Base graphique : tokens.json et guides du kit LIMPID_UI_KIT_V4_Integration_Opus, lus dans le Drive Limpid. Ressources de marque existantes conservées.
- Roediger & Karpicke, 2006 : récupération active et rétention différée. https://pubmed.ncbi.nlm.nih.gov/16507066/
- Cepeda et al., 2008 : espacement dépendant du délai de rétention. https://pubmed.ncbi.nlm.nih.gov/19076480/
- Chi et al., 1989 : auto-explication et compréhension des exemples. https://doi.org/10.1207/s15516709cog1302_1
- Butler et al., 2018 : varier les exemples lors des rappels pour soutenir le transfert. https://pubmed.ncbi.nlm.nih.gov/29265856/
- W3C WCAG 2.2 : reflow 1.4.10, contraste 1.4.3, espacement 1.4.12, cible tactile 2.5.8 et focus non masqué 2.4.11. https://www.w3.org/TR/WCAG22/
- Interprétation produit : les tailles, couleurs, budgets de texte et seuils de visibilité proposés sont des paramètres de design. Ils doivent être évalués dans Limpid ; ils ne sont pas des prescriptions universelles.

Objectif : permettre à un utilisateur d’étudier seul, y compris lorsqu’il perd facilement le fil. Priorités : fidélité, compréhension, autonomie, repérage, puis densité et présentation.

