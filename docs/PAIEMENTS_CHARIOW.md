# Mise en service des paiements Chariow

Ce guide accompagne la phase 14 (comptes, crédits, Chariow). Le code est livré et testé. Il reste une configuration à faire dans Chariow et dans Vercel : aucun secret ne passe par le dépôt.

Adresse de production : `https://limpidgooroo.vercel.app`

## 1. Créer les neuf produits dans Chariow

Créez chaque produit avec le type **Licence**. C'est le seul type qui autorise les achats répétés, donc les renouvellements et les recharges successives. En devise **XOF**, au prix exact ci-dessous, sans « prix libre » :

| Code Limpid | Nom suggéré | Prix |
|---|---|---:|
| `essential_monthly` | Limpid Essentiel — 1 mois | 2 900 FCFA |
| `essential_yearly` | Limpid Essentiel — 12 mois | 29 000 FCFA |
| `plus_monthly` | Limpid Plus — 1 mois | 5 900 FCFA |
| `plus_yearly` | Limpid Plus — 12 mois | 59 000 FCFA |
| `pro_monthly` | Limpid Pro — 1 mois | 11 900 FCFA |
| `pro_yearly` | Limpid Pro — 12 mois | 119 000 FCFA |
| `topup_70` | Recharge Limpid — 70 crédits | 1 000 FCFA |
| `topup_180` | Recharge Limpid — 180 crédits | 2 500 FCFA |
| `topup_500` | Recharge Limpid — 500 crédits | 5 000 FCFA |

Notez l'identifiant public de chaque produit (`prd_…`). Limpid refuse toute vente dont le produit, le montant (XOF) ou la boutique ne correspondent pas : elle passe alors « en revue », sans crédit.

## 2. Créer le Pulse (webhook)

Dans Chariow, ouvrez **Automatisations → Pulses → Nouveau Pulse** :

- **URL** : `https://limpidgooroo.vercel.app/api/webhooks/chariow`
- **Événements** : `successful.sale`, `failed.sale`, `abandoned.sale`. Les événements `license.*` sont acceptés mais n'attribuent rien.
- **Produits** : les neuf produits ci-dessus, ou aucun filtre.
- Copiez le **Signing secret** (`whsec_…`), dans l'onglet Overview du Pulse.

Un « test » envoyé depuis le tableau de bord est enregistré mais n'attribue jamais de crédits : il n'a pas d'identifiant de livraison. Après 5 échecs de livraison, Chariow désactive le Pulse. Les livraisons reçues sont visibles dans `/admin` → Paiements et crédits.

## 3. Variables dans Vercel (Production)

| Variable | Valeur |
|---|---|
| `CHARIOW_API_KEY` | clé `sk_live_…` (Chariow → Paramètres → API) |
| `CHARIOW_PULSE_SECRET` | `whsec_…` du Pulse |
| `CHARIOW_STORE_ID` | identifiant de la boutique (`str_…`), recommandé |
| `CHARIOW_PRODUCTS` | `{"essential_monthly":"prd_…","essential_yearly":"prd_…","plus_monthly":"prd_…","plus_yearly":"prd_…","pro_monthly":"prd_…","pro_yearly":"prd_…","topup_70":"prd_…","topup_180":"prd_…","topup_500":"prd_…"}` |
| `LIMPID_SITE_URL` | `https://limpidgooroo.vercel.app` |
| `CHARIOW_CHECKOUT_HOSTS` | facultatif. Par défaut : `chariow.com,mychariow.com,chariow.shop,moneroo.io` |

Redéployez ensuite.

- Tant qu'une variable manque, les boutons de paiement affichent « Le paiement n'est pas encore ouvert » au lieu d'un faux paiement.
- Si un paiement échoue avec « Adresse de paiement inattendue », le domaine de la page de paiement Chariow n'est pas dans la liste par défaut. Ajoutez-le à `CHARIOW_CHECKOUT_HOSTS`.

## 4. Ouvrir les inscriptions gratuites

Dans `/admin`, section **Paiements et crédits**, cochez « Inscriptions publiques ouvertes ». Fermées par défaut, elles permettent alors à n'importe qui de créer un compte sur `/inscription` : rôle utilisateur, offre gratuite.

L'offre gratuite donne 80 crédits par cycle mensuel, au plus 2 rapports par jour et 5 par semaine. Les crédits ne sont versés qu'après confirmation de l'adresse email.

## 5. Premier essai réel

1. Achetez la recharge à 1 000 FCFA depuis `/offres` avec votre compte.
2. Au retour sur `/paiement/retour`, la page affiche « Paiement confirmé » et le nouveau solde. Si le webhook arrive plus tard, la page se revérifie seule pendant 2 minutes.
3. Dans `/admin` : la commande apparaît « succeeded » et le Pulse « processed ».

En cas de webhook perdu, le bouton **Rapprocher les commandes en attente** (admin), le cron quotidien et toute visite de la page de retour relisent la vente chez Chariow.

## Règles appliquées

- **Prix fixe annoncé avant l'action**, réservé avant tout appel IA, consommé à la livraison, rendu en cas d'échec.
  - Rapport court, standard ou long : 22, 40 ou 92 crédits (simulation du 6 octobre 2026).
  - Nouvelle version : 8. Question : 1. Nouveau test : 3.
- **Crédits mensuels** : ils expirent en fin de cycle, sans report.
- **Recharges** : valables 12 mois. Elles ouvrent le mode « Recharge » (fonctions Essentiel) sans mois d'abonnement.
- **Abonnements** : prépayés, sans prélèvement automatique. Un renouvellement anticipé ou un changement d'offre commence à la fin de l'accès déjà payé. L'annuel verse l'allocation chaque mois.
- **Attribution** : une seule par vente, quel que soit le nombre de webhooks reçus.
