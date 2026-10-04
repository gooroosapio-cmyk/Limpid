# Limpid

> Déposez n'importe quoi. Comprenez l'essentiel.

Alpha privée : une source devient un rapport clair, illustré, sourcé, lisible sur téléphone et exportable en PDF.

- Cadrage : [`docs/CADRAGE.md`](docs/CADRAGE.md)
- Avancement : [`docs/AVANCEMENT.md`](docs/AVANCEMENT.md)

## Stack

Next.js 16 (App Router) + TypeScript · Supabase (Postgres, Auth, Storage) · Google Gemini via un adaptateur `AIProvider` · Zod pour les contrats · Vitest.

## Organisation

| Dossier | Rôle |
|---------|------|
| `src/app` | Pages : Créer, Mes rapports, Préférences, lecteur |
| `src/components` | Interface (navigation, import, QCM, lecteur, sources) |
| `src/lib/contracts` | Schémas versionnés du moteur et contrôles sémantiques |
| `src/lib/engine` | Interface fournisseur IA, adaptateur Gemini |
| `src/lib/security` | Protection SSRF, contrôle des fichiers |
| `src/lib/jobs` | Machine d'états des tâches |
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
