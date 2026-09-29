#!/bin/sh
# Runs once, when the volume is first initialised (docker-entrypoint-initdb.d).
# stepler_test: API integration tests. stepler_e2e: Playwright (separate, so the two suites
# can run at the same time). stepler_shadow: Prisma's shadow database for the
# migration drift check; Prisma resets it, so it must never be the dev or test database.
set -eu
for db in stepler_test stepler_e2e stepler_shadow; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -c "CREATE DATABASE \"$db\" OWNER \"$POSTGRES_USER\""
done
