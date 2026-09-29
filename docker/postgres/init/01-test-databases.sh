#!/bin/sh
# Runs once, when the volume is first initialised (docker-entrypoint-initdb.d).
# stepler_test: integration and e2e tests. stepler_shadow: Prisma's shadow database for the
# migration drift check; Prisma resets it, so it must never be the dev or test database.
set -eu
for db in stepler_test stepler_shadow; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -c "CREATE DATABASE \"$db\" OWNER \"$POSTGRES_USER\""
done
