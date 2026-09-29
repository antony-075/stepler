#!/usr/bin/env bash
# Builds the production images and checks the properties CI relies on.
set -euo pipefail
cd "$(dirname "$0")/../.."

API_IMAGE=eventdrop-api:verify
WEB_IMAGE=eventdrop-web:verify
NET=eventdrop-verify
cleanup() {
  docker rm -f eventdrop-verify-api eventdrop-verify-web >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }

docker build -f apps/api/Dockerfile -t "$API_IMAGE" .
docker build -f apps/web/Dockerfile -t "$WEB_IMAGE" .

for image in "$API_IMAGE" "$WEB_IMAGE"; do
  uid=$(docker run --rm --entrypoint id "$image" -u)
  [ "$uid" != "0" ] || fail "$image runs as root"
  envs=$(docker run --rm --entrypoint sh "$image" -c 'find / -xdev -name ".env" -o -xdev -name ".env.*" ! -name ".env.example" 2>/dev/null | grep -v "^/proc" | wc -l')
  [ "$envs" -eq 0 ] || fail "$image contains .env files"
done

if docker run --rm --entrypoint sh "$API_IMAGE" -c 'ls /app/node_modules/.pnpm 2>/dev/null | grep -qE "^(vitest|typescript|@nestjs\+cli)@"'; then
  fail "api image contains dev dependencies"
fi

docker network create "$NET" >/dev/null
docker run -d --name eventdrop-verify-api --network "$NET" -e NODE_ENV=production "$API_IMAGE" >/dev/null
docker run -d --name eventdrop-verify-web --network "$NET" -p 127.0.0.1:3199:3000 \
  -e API_INTERNAL_URL=http://eventdrop-verify-api:4000 "$WEB_IMAGE" >/dev/null

for _ in $(seq 1 30); do
  status=$(docker inspect -f '{{.State.Health.Status}}' eventdrop-verify-api)
  [ "$status" = "healthy" ] && break
  sleep 1
done
[ "$status" = "healthy" ] || fail "api container not healthy (status: $status)"

for _ in $(seq 1 20); do
  curl -fsS -o /dev/null http://127.0.0.1:3199/ && break
  sleep 1
done
curl -fsS -o /dev/null http://127.0.0.1:3199/ || fail "web did not answer GET /"
body=$(curl -fsS http://127.0.0.1:3199/api/v1/health/live) || fail "web → api proxy failed"
[ "$body" = '{"status":"ok"}' ] || fail "unexpected health body: $body"

docker run --rm -e NODE_ENV=staging "$API_IMAGE" >/dev/null 2>&1 && fail "api started with invalid env"

echo "All image checks passed."
