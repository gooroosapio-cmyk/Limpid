# Limpid — Produits à créer dans Chariow

Ce document reprend les fiches de `LIMPID_Produits_Chariow_A_Creer.md`, corrigées le 5 octobre 2026 pour suivre le catalogue en vigueur (`src/lib/billing/catalog.ts`) et les plafonds de la V2. Aucun produit n'est créé par ce document : les identifiants et les liens réels se copient depuis la boutique.

## Réglages communs aux neuf produits

| Réglage | Valeur |
|---|---|
| Type | **Licence** (le seul type qui accepte les achats répétés : renouvellements et recharges) |
| Paiement | Unique, prix fixe en **XOF** (pas de prix libre, pas de coupon non répertorié) |
| Génération de la clé | Automatique |
| Activation | **Non requise** : Limpid n'utilise pas l'activation de licence (voir plus bas) |
| Activations maximales | **1** |
| Expédition | Aucune |
| Durée de validité | Voir chaque produit. Si la boutique ne propose que des jours, **ne publiez pas** l'offre avec un libellé « mois » : signalez-le, on aligne d'abord les textes. |

**Licences et renouvellements.** La clé de licence n'est qu'une preuve d'achat : l'accès est calculé par Limpid à partir de la vente vérifiée (`GET /v1/sales/{id}`), pas de la licence. Un renouvellement acheté en avance commence donc à la fin de la période déjà payée, quelle que soit la date d'activation de la clé côté Chariow. L'API Chariow ne permet pas aujourd'hui de relier de façon prouvée une licence à sa vente (son `sale_id` est un entier interne) : Limpid n'active donc aucune licence, et la durée de validité de la licence Chariow n'a pas d'effet sur l'accès.

## Tableau de configuration

| Code Limpid (`CHARIOW_PRODUCTS`) | SKU | Nom du produit | Prix | Crédits | Validité |
|---|---|---|---:|---|---|
| `essential_monthly` | ESS_M | Limpid Essentiel — Mensuel — 240 crédits/mois | 2 900 FCFA | 240 × 1 | 1 mois |
| `essential_yearly` | ESS_A | Limpid Essentiel — Annuel — 240 crédits/mois | 29 000 FCFA | 240 × 12 (un versement par mois) | 12 mois |
| `plus_monthly` | PLUS_M | Limpid Plus — Mensuel — 600 crédits/mois | 5 900 FCFA | 600 × 1 | 1 mois |
| `plus_yearly` | PLUS_A | Limpid Plus — Annuel — 600 crédits/mois | 59 000 FCFA | 600 × 12 (un versement par mois) | 12 mois |
| `pro_monthly` | PRO_M | Limpid Pro — Mensuel — 1 500 crédits/mois | 11 900 FCFA | 1 500 × 1 | 1 mois |
| `pro_yearly` | PRO_A | Limpid Pro — Annuel — 1 500 crédits/mois | 119 000 FCFA | 1 500 × 12 (un versement par mois) | 12 mois |
| `topup_70` | TOPUP_70 | Limpid — Recharge 70 crédits | 1 000 FCFA | 70, une seule fois | 12 mois après attribution |
| `topup_180` | TOPUP_180 | Limpid — Recharge 180 crédits | 2 500 FCFA | 180, une seule fois | 12 mois après attribution |
| `topup_500` | TOPUP_500 | Limpid — Recharge 500 crédits | 5 000 FCFA | 500, une seule fois | 12 mois après attribution |

Plafonds de rapports (en plus des crédits) : Essentiel 5 par jour et 20 par semaine ; Plus 10 et 50 ; Pro 20 et 100. La recharge sans abonnement suit les plafonds Essentiel (5 et 20). Le jour est le jour calendaire UTC ; la semaine commence le lundi à 00:00 UTC (minuit à Abidjan).

## Paragraphe commun à toutes les fiches

> **Adresse à renseigner au paiement.** Dans les informations de paiement Chariow, renseignez l'adresse email du compte Limpid à activer. Utilisez exactement l'adresse affichée dans votre compte. Votre abonnement ou vos crédits seront attribués à ce compte après vérification du paiement. La clé de licence est une preuve d'achat, pas un mot de passe : vous n'avez pas besoin de la recopier.
>
> Un achat sans compte correspondant est conservé : il sera rattaché dès que vous aurez créé votre compte avec cette adresse et confirmé celle-ci.

## Fiches

### ESS_M — Limpid Essentiel — Mensuel — 240 crédits/mois

**2 900 FCFA, paiement unique.**

Accédez à Limpid Essentiel pendant un mois et recevez 240 crédits au début de cette période, soit l'équivalent de 12 rapports standard (20 crédits chacun).

Vous pouvez créer jusqu'à 5 rapports par jour et 20 par semaine, dans la limite de vos crédits disponibles. Ces plafonds ne sont pas des rapports offerts en plus.

Inclus : plusieurs documents par Limpid (jusqu'à 5), 30 Limpid conservés, PDF sans filigrane.

Les crédits mensuels non utilisés expirent à la fin de leur cycle. Pour continuer après l'échéance, achetez à nouveau cette offre. Un renouvellement anticipé, ou un changement entre offres payantes, commence après la période déjà payée et n'ajoute pas de crédits aujourd'hui.

*Paragraphe commun.*

### ESS_A — Limpid Essentiel — Annuel — 240 crédits/mois

**29 000 FCFA, paiement unique (2 mois offerts).**

Accédez à Limpid Essentiel pendant douze mois. Vous recevez 240 crédits au début de chaque cycle mensuel, soit douze versements. Les 2 880 crédits ne sont pas attribués en une fois.

Mêmes plafonds, fonctions et règles d'expiration que l'offre mensuelle.

*Paragraphe commun.*

### PLUS_M — Limpid Plus — Mensuel — 600 crédits/mois

**5 900 FCFA, paiement unique.**

Accédez à Limpid Plus pendant un mois et recevez 600 crédits au début de cette période, soit l'équivalent de 30 rapports standard.

Vous pouvez créer jusqu'à 10 rapports par jour et 50 par semaine, dans la limite de vos crédits disponibles. Ces plafonds ne sont pas des rapports offerts en plus.

Inclus : tout Essentiel, 100 Limpid conservés, 2 préparations en même temps.

Les crédits mensuels non utilisés expirent à la fin de leur cycle. Pour continuer, achetez à nouveau cette offre. Un renouvellement anticipé, ou un changement entre offres payantes, commence après la période déjà payée.

*Paragraphe commun.*

### PLUS_A — Limpid Plus — Annuel — 600 crédits/mois

**59 000 FCFA, paiement unique (2 mois offerts).**

Douze mois de Limpid Plus. Vous recevez 600 crédits au début de chaque cycle mensuel, soit douze versements. Les 7 200 crédits ne sont pas attribués en une fois.

Mêmes plafonds, fonctions et règles que l'offre mensuelle.

*Paragraphe commun.*

### PRO_M — Limpid Pro — Mensuel — 1 500 crédits/mois

**11 900 FCFA, paiement unique.**

Accédez à Limpid Pro pendant un mois et recevez 1 500 crédits au début de cette période, soit l'équivalent de 75 rapports standard.

Vous pouvez créer jusqu'à 20 rapports par jour et 100 par semaine, dans la limite de vos crédits disponibles. Ces plafonds ne sont pas des rapports offerts en plus.

Inclus : tout Plus, 300 Limpid conservés, 3 préparations en même temps.

Les crédits mensuels non utilisés expirent à la fin de leur cycle. Pour continuer, achetez à nouveau cette offre. Un renouvellement anticipé, ou un changement entre offres payantes, commence après la période déjà payée.

*Paragraphe commun.*

### PRO_A — Limpid Pro — Annuel — 1 500 crédits/mois

**119 000 FCFA, paiement unique (2 mois offerts).**

Douze mois de Limpid Pro. Vous recevez 1 500 crédits au début de chaque cycle mensuel, soit douze versements. Les 18 000 crédits ne sont pas attribués en une fois.

Mêmes plafonds, fonctions et règles que l'offre mensuelle.

*Paragraphe commun.*

### TOPUP_70 — Limpid — Recharge 70 crédits

**1 000 FCFA, paiement unique.**

Ajoutez 70 crédits à votre compte Limpid (l'équivalent de 3 rapports standard). Ils sont attribués une seule fois, après vérification du paiement, et restent valables douze mois.

Une recharge ne prolonge pas votre abonnement, ne donne pas les fonctions Plus ou Pro et ne remet pas à zéro vos plafonds de rapports. Sans abonnement actif, le mode Recharge donne accès aux fonctions Essentiel, avec 5 rapports par jour et 20 par semaine, tant que la recharge reste utilisable.

*Paragraphe commun.*

### TOPUP_180 — Limpid — Recharge 180 crédits

**2 500 FCFA, paiement unique.**

Ajoutez 180 crédits à votre compte Limpid (l'équivalent de 9 rapports standard), valables douze mois après attribution. Mêmes règles que la recharge de 70 crédits.

*Paragraphe commun.*

### TOPUP_500 — Limpid — Recharge 500 crédits

**5 000 FCFA, paiement unique.**

Ajoutez 500 crédits à votre compte Limpid (l'équivalent de 25 rapports standard), valables douze mois après attribution. Mêmes règles que la recharge de 70 crédits.

*Paragraphe commun.*

## À relever dans la boutique pour chaque produit

| Code | Identifiant `prd_…` | Lien public de la fiche |
|---|---|---|
| `essential_monthly` | À RENSEIGNER | À RENSEIGNER |
| `essential_yearly` | À RENSEIGNER | À RENSEIGNER |
| `plus_monthly` | À RENSEIGNER | À RENSEIGNER |
| `plus_yearly` | À RENSEIGNER | À RENSEIGNER |
| `pro_monthly` | À RENSEIGNER | À RENSEIGNER |
| `pro_yearly` | À RENSEIGNER | À RENSEIGNER |
| `topup_70` | À RENSEIGNER | À RENSEIGNER |
| `topup_180` | À RENSEIGNER | À RENSEIGNER |
| `topup_500` | À RENSEIGNER | À RENSEIGNER |

Les identifiants vont dans la variable Vercel `CHARIOW_PRODUCTS`. Les liens publics servent aux achats directs depuis la boutique : ils sont rattachés au compte dont l'adresse confirmée correspond à celle du paiement.

## Achats faits directement sur la boutique

| Situation | Ce que fait Limpid |
|---|---|
| Un compte a confirmé l'adresse du paiement | Rattaché dès le Pulse `successful.sale`, après relecture de la vente |
| Aucun compte, ou adresse pas encore confirmée | Achat conservé ; rattaché dès que l'adresse est confirmée (lien email, Google/Apple, ou bouton « J'ai déjà payé » dans Mes crédits) |
| Produit, montant ou boutique inattendus, ou adresse absente | Mis en vérification (visible dans /admin), rien n'est attribué |
| Payé via Limpid mais avec une autre adresse que celle du compte | Commande mise en vérification, rien n'est attribué |
| Payé avec une autre adresse sur la boutique | Pas de rattachement automatique : traiter à la main depuis /admin (« Ajouter des crédits », motif journalisé) |
