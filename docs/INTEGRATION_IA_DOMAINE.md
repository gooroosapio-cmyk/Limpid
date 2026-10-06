# Intégrer l'API IA (OpenRouter) et le domaine limpid.company

Ce guide suit l'ordre recommandé. Ne collez jamais une clé dans un message ou dans le code : elles vont **uniquement** dans Vercel (Settings → Environment Variables), cochées pour **Production** (et Preview si vous voulez tester sur les aperçus).

---

## 1. OpenRouter (texte et images : une seule clé)

1. Sur **openrouter.ai** → *Keys* → *Create key*. Nommez-la « Limpid production ».
2. Fixez une **limite de crédit** sur la clé (ex. 50 USD) : c'est votre filet de sécurité côté fournisseur.
3. *Credits* : rechargez le compte (la simulation prévoit au moins une semaine chargée de dépenses variables).
4. Dans **Vercel** → projet `limpid_gooroo` → *Settings* → *Environment Variables*, ajoutez :

| Variable | Valeur | Obligatoire |
|---|---|---|
| `OPENROUTER_API_KEY` | votre clé `sk-or-…` | oui |
| `LIMPID_AI_PROVIDER` | `openrouter` | conseillé (sinon déduit de la clé) |
| `LIMPID_USD_TO_EUR` | `0.92` | non |

**Ne définissez pas** `LIMPID_MODEL_LITE`, `LIMPID_MODEL_EDITOR`, `LIMPID_MODEL_COMPLEX` ni `LIMPID_MODEL_FALLBACKS` : vides, Limpid applique les choix du comparatif IA (6 octobre 2026).

| Tâche | Modèle (OpenRouter) |
|---|---|
| Lecture du document, plan, rédaction Feynman, QCM, bilan, chat | `openai/gpt-6-luna-pro` (réflexion basse ou moyenne) |
| Chapitre difficile, dernière réparation | `openai/gpt-6-luna-pro`, réflexion haute |
| Illustrations simples | `recraft/recraft-v4.1-flash` (0,007 $) |
| Dessins vectoriels SVG | banque Limpid d'abord, sinon `recraft/recraft-v4.1-vector` (0,08 $) |
| Scènes réalistes, schémas annotés | `bytedance-seed/seedream-5-0-flash` (0,018 $) |
| Couverture | Pixabay (gratuit), sinon `bytedance-seed/seedream-5-0-flash` |

Les modèles d'image se règlent dans **Administration → Images des cours**. Plafond par cours selon la taille : court 1 image + 1 SVG, standard 2 + 1, long 3 + 2. Le coût réel de chaque appel, renvoyé par OpenRouter, est inscrit au journal.

5. Les anciennes variables `GEMINI_API_KEY`, `LIMPID_MODEL_FAST`, `LIMPID_MODEL_QUALITY`, `AI_REPORT_MODEL`, `AI_CHAT_MODEL`, `LIMPID_IMAGE_MODEL`, `RECRAFT_API_KEY`, `LIMPID_RECRAFT_MODEL`, `LIMPID_ILLUSTRATIONS_RECRAFT` ne servent plus : supprimez-les.

## 2. Recraft et Seedream

Plus de compte ni de clé Recraft : Recraft V4.1 et Seedream 5.0 Flash sont facturés sur le solde OpenRouter. Les SVG sont nettoyés (aucun script ni lien externe) avant stockage privé ; un SVG généré est versé dans la banque Limpid (mots-clés génériques, aucune donnée de compte ni de document) et réutilisé pour les cours suivants sans nouvelle génération.

## 2 bis. Pixabay (couvertures)

Les couvertures sont des illustrations de la banque Pixabay, choisies d'après le thème du document (mots-clés prévus par le plan, sinon le titre). Si Pixabay ne trouve rien, une image décorative sans texte est générée par Gemini (Nano Banana 2 Lite, via OpenRouter, comptée dans le budget IA).

1. Créez un compte gratuit sur **pixabay.com** (ou connectez-vous).
2. Ouvrez **https://pixabay.com/api/docs/** : une fois connecté, votre clé apparaît dans la section « Parameters » (paramètre `key`, en vert).
3. Dans **Vercel** → *Settings* → *Environment Variables* (Production) : `PIXABAY_API_KEY` = cette clé, puis **Redeploy**.
4. Supprimez `UNSPLASH_ACCESS_KEY` et `LIMPID_ILLUSTRATIONS_UNSPLASH` (plus utilisées).
5. Vérification : **Administration → Diagnostic** affiche « Couvertures (Pixabay, sinon Gemini) : illustration Pixabay selon le thème du document, sinon image Gemini ». Créez un cours : sa carte reçoit une illustration ; l'aperçu affiche « Illustration : auteur » (le nom de Pixabay n'est pas affiché).

Fonctionnement : Limpid cherche d'abord une illustration (format paysage, recherche sécurisée), sinon une image Pixabay de tout type ; l'image est téléchargée, recadrée en 4/3 et servie par Limpid (Pixabay interdit l'affichage permanent depuis ses serveurs). Dans la bibliothèque, « Changer de couverture » propose une autre illustration sur le même thème. Limite de l'API : 100 requêtes par minute, largement suffisant.

## 3. Plafonds de dépense (important)

Un rapport long complexe coûte environ 0,73 USD. Les anciens plafonds bloqueraient la production :

| Variable Vercel | Valeur conseillée | Rôle |
|---|---|---|
| `LIMPID_MONTHLY_CAP_CENTS` | `5000` (50 €) ou plus | plafond global du mois, en centimes d'euro |
| `LIMPID_REPORT_CAP_CENTS` | `120` | réserve vérifiée avant chaque rapport |
| `LIMPID_ACCOUNT_DAILY_CAP_CENTS` | `600` | plafond par compte sur 24 h |

Puis dans **Limpid → Administration**, réglez aussi le **plafond mensuel** enregistré en base : il vaut actuellement **10 €** et le plus petit des deux s'applique.

## 4. Nom de domaine limpid.company

### 4.1 Vercel
1. *Settings* → *Domains* → *Add* : `limpid.company`, puis `www.limpid.company`.
2. Pour `www.limpid.company`, choisissez *Redirect to* `limpid.company` (308).
3. Pour l'ancienne adresse `limpidgooroo.vercel.app` : *Edit* → *Redirect to* `limpid.company`.
4. Vercel affiche les enregistrements DNS à créer chez votre registraire, en général :
   - `A` sur `@` → `76.76.21.21`
   - `CNAME` sur `www` → `cname.vercel-dns.com`
   (Recopiez exactement les valeurs que Vercel affiche pour votre projet.)
5. Attendez le cadenas « Valid Configuration » (certificat HTTPS automatique).
6. Variable Vercel : `LIMPID_SITE_URL` = `https://limpid.company`, puis **Redeploy** de la production.

### 4.2 Supabase (connexion, liens par e-mail)
*Authentication* → *URL Configuration* :
- **Site URL** : `https://limpid.company`
- **Redirect URLs** : ajoutez `https://limpid.company/auth/callback` et `https://limpid.company/**` (gardez l'ancienne adresse quelques jours, puis retirez-la).

### 4.3 Google et Apple (connexion)
- **Google Cloud** → *APIs & Services* → *Credentials* → votre client OAuth : ajoutez `https://limpid.company` aux *Authorized JavaScript origins*. L'URI de redirection reste celle de Supabase (`https://<projet>.supabase.co/auth/v1/callback`) : ne la changez pas. Dans *OAuth consent screen*, ajoutez `limpid.company` aux domaines autorisés.
- **Apple** (si activé) → *Services ID* → *Domains and Subdomains* : ajoutez `limpid.company` ; l'URL de retour reste celle de Supabase.

### 4.4 E-mails (Resend, envoyés par Supabase)
1. **Resend** → *Domains* → *Add domain* : `limpid.company`.
2. Créez chez le registraire les enregistrements affichés par Resend (SPF `TXT`, DKIM `TXT`/`CNAME`, `MX` d'envoi) et, recommandé, un DMARC : `TXT` sur `_dmarc` → `v=DMARC1; p=quarantine; rua=mailto:postmaster@limpid.company`.
3. Une fois le domaine « Verified », dans **Supabase** → *Authentication* → *SMTP Settings* : expéditeur `noreply@limpid.company`, nom « Limpid ».
4. Envoyez-vous un lien de connexion pour vérifier l'arrivée (et pas en spam).

### 4.5 Chariow (paiements)
Dans votre boutique Chariow, remplacez l'ancienne adresse par la nouvelle :
- **Webhook (pulses)** : `https://limpid.company/api/webhooks/chariow`
- **URL de retour après paiement** : `https://limpid.company/paiement/retour` (les liens de paiement créés par Limpid utilisent déjà `LIMPID_SITE_URL`).

## 5. Vérification de bout en bout

1. **Administration → Diagnostic** : « Fournisseur IA : OpenRouter », les trois modèles, « Illustrations vectorielles : actives », « Adresse du site : https://limpid.company ». Lancez l'appel de test.
2. Créez un rapport court : il doit passer par les étapes, recevoir une couverture et une illustration vectorielle, et débiter 22 crédits.
3. Ouvrez le PDF : l'illustration vectorielle y apparaît.
4. Dans OpenRouter → *Activity*, vérifiez les appels (Flash-Lite, Flash, éventuellement Pro) et leur coût ; dans Recraft, le solde d'unités.
5. Testez la connexion par lien e-mail et par Google sur `https://limpid.company`.

## 6. Inscriptions
Les inscriptions sont **fermées** en base (`signup_open = false`). Pour ouvrir au public avec le nouveau domaine : Administration → Inscriptions → Ouvrir.
