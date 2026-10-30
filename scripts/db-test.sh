#!/usr/bin/env bash
# Runs every migration and policy test against a throwaway Postgres database.
# Usage: DATABASE_URL=postgres://user:pass@host:5432/postgres scripts/db-test.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?set DATABASE_URL to a disposable Postgres database}"
DB_NAME="strlytics_test_$$"
ADMIN_URL="$DATABASE_URL"
psql "$ADMIN_URL" -qX -v ON_ERROR_STOP=1 -c "create database $DB_NAME" >/dev/null
TEST_URL="${ADMIN_URL%/*}/$DB_NAME"
cleanup() { psql "$ADMIN_URL" -qX -c "drop database if exists $DB_NAME with (force)" >/dev/null || true; }
trap cleanup EXIT
run() { psql "$TEST_URL" -qX -v ON_ERROR_STOP=1 -f "$1" >/dev/null; }

run supabase/tests/_shim_supabase_auth.sql
for f in supabase/migrations/*.sql; do echo "migrate  $f"; run "$f"; done
for f in supabase/tests/*_test.sql; do echo "test     $f"; run "$f"; done
echo "All database tests passed."
