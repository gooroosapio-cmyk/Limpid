# Limpid — Connexion Google et Apple

Les boutons « Continuer avec Google » et « Continuer avec Apple » n'apparaissent sur `/connexion` et `/inscription` que si la variable Vercel correspondante vaut `on`. Tant qu'un fournisseur n'est pas réglé, aucun bouton fictif n'est affiché.

## Fonctionnement

1. Le bouton ouvre `/auth/oauth/google` (ou `apple`), qui demande l'URL du fournisseur à Supabase Auth (PKCE) et y redirige.
2. Le fournisseur renvoie vers Supabase, puis vers `https://limpidgooroo.vercel.app/auth/callback`, qui échange le code contre la session (même chemin que les liens email).
3. Un nouveau compte passe par la même règle qu'une inscription email : refusé si les inscriptions sont fermées et que l'adresse n'est pas invitée (message dédié sur la page de connexion), sinon compte gratuit. L'adresse donnée par Google ou Apple est vérifiée : les 80 crédits gratuits sont actifs tout de suite.
4. Même adresse vérifiée qu'un compte existant : Supabase rattache l'identité au compte existant (pas de doublon).
5. Portées minimales : Google `openid email profile`, Apple `name email`. Aucun accès à Gmail, Drive ou aux contacts.

**Apple et l'adresse masquée.** Si l'utilisateur choisit « Masquer mon adresse », son compte Limpid porte une adresse `…@privaterelay.appleid.com`. C'est cette adresse qu'il doit saisir au paiement Chariow : le récapitulatif de paiement l'affiche avec « Copier l'adresse ».

## Google

1. Google Cloud Console > API et services > Écran de consentement OAuth : type Externe, nom « Limpid », domaine `limpidgooroo.vercel.app`, portées `email`, `profile`, `openid` uniquement. Publiez l'application (sinon seuls les testeurs peuvent se connecter).
2. Identifiants > Créer > ID client OAuth > Application Web.
   - URI de redirection autorisé : `https://clrqerejtweemalkupig.supabase.co/auth/v1/callback`
3. Supabase > Authentication > Sign In / Providers > Google : activer, coller l'ID client et le secret client.
4. Vercel : `LIMPID_AUTH_GOOGLE=on`, puis redéployer.

## Apple

Prérequis : un compte Apple Developer payant.

1. Certificates, Identifiers & Profiles > Identifiers : un App ID avec « Sign In with Apple », puis un **Services ID** (ex. `app.limpid.web`) avec Sign In with Apple configuré :
   - Domaine : `clrqerejtweemalkupig.supabase.co`
   - Return URL : `https://clrqerejtweemalkupig.supabase.co/auth/v1/callback`
2. Keys : créer une clé « Sign In with Apple » (fichier `.p8`), noter le Key ID et le Team ID.
3. Supabase > Authentication > Providers > Apple : activer, Client ID = le Services ID, puis le secret généré à partir de la clé `.p8` (Supabase fournit l'outil). **Ce secret expire au bout de 6 mois** : notez la date pour le régénérer.
4. Vercel : `LIMPID_AUTH_APPLE=on`, puis redéployer.

## Supabase, dans tous les cas

Authentication > URL Configuration : Site URL `https://limpidgooroo.vercel.app`, et `https://limpidgooroo.vercel.app/auth/callback` dans les Redirect URLs.
