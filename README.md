# Limpid

> Déposez n'importe quoi. Comprenez l'essentiel.

Une source devient un rapport clair, illustré, sourcé, lisible sur téléphone et exportable en PDF. Offre gratuite et offres payantes (crédits, paiement Chariow) ; inscriptions ouvertes ou fermées depuis l'administration.

- Cadrage : [`docs/CADRAGE.md`](docs/CADRAGE.md)
- Avancement : [`docs/AVANCEMENT.md`](docs/AVANCEMENT.md)
- Paiements : [`docs/PAIEMENTS_CHARIOW.md`](docs/PAIEMENTS_CHARIOW.md), produits : [`docs/PRODUITS_CHARIOW.md`](docs/PRODUITS_CHARIOW.md)
- Connexion Google / Apple : [`docs/CONNEXION_GOOGLE_APPLE.md`](docs/CONNEXION_GOOGLE_APPLE.md)

## Stack

Next.js 16 (App Router) + TypeScript · Supabase (Postgres, Auth, Storage) · Google Gemini via un adaptateur `AIProvider` · Zod pour les contrats · Vitest.
Extraction : unpdf (pdf.js) pour les PDF, fflate pour les DOCX, linkedom + Readability pour les pages web. Export : @react-pdf/renderer avec la police Inter (OFL) intégrée.

## Organisation

| Dossier | Rôle |
|---------|------|
| `src/app` | Pages : accueil et bibliothèque (`/`), ajout (`/ajouter`), lecteur (`/rapports/[id]`), compte (`/compte/*`), paramètres (`/parametres`), offres et paiement (`/offres`, `/paiement`), administration (`/admin`) |
| `src/components` | Interface (navigation, import, QCM, lecteur, sources) |
| `src/lib/contracts` | Schémas versionnés du moteur et contrôles sémantiques |
| `src/lib/engine` | Interface fournisseur IA, adaptateur Gemini, pipeline de génération |
| `src/lib/extract` | Extraction PDF / DOCX / TXT / pages web en segments figés, couverture |
| `src/lib/render` | Numérotation des sources, export PDF |
| `src/lib/sources` | Envoi direct des fichiers (URL signée), purge des originaux |
| `src/lib/security` | Protection SSRF, contrôle des fichiers |
| `src/lib/jobs` | Machine d'états des tâches, worker |
| `src/lib/billing` | Offres, crédits, plafonds, paiement Chariow, achats boutique |
| `src/lib/auth` | Mots de passe, sessions d'appareil, double authentification admin, Google / Apple |
| `src/lib/demo` | Rapport de démonstration rédigé à la main |
| `supabase/migrations` | Schéma SQL, RLS, triggers |
| `supabase/tests` | Recette SQL (isolation entre comptes, transitions, suppression) |

## Commandes

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck
npm test
npm run build
PGURL=postgres://… ./supabase/tests/run.sh   # base jetable uniquement
```

Sans `GEMINI_API_KEY`, l'application tourne en **mode démonstration** affiché comme tel : aucune génération réelle n'a lieu.
