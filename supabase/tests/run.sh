#!/usr/bin/env bash
# Applique la migration sur une base Postgres jetable et exécute la recette SQL.
# Usage : PGURL=postgres://... ./supabase/tests/run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
psql "$PGURL" -v ON_ERROR_STOP=1 -q -f "$here/supabase-stub.sql"
for f in "$here"/../migrations/*.sql; do psql "$PGURL" -v ON_ERROR_STOP=1 -q -f "$f"; done
psql "$PGURL" -v ON_ERROR_STOP=1 -q -f "$here/rls.test.sql"
psql "$PGURL" -v ON_ERROR_STOP=1 -q -f "$here/credits.test.sql"
