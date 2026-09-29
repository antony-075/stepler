#!/usr/bin/env bash
# Builds the production images and checks the properties CI relies on.
set -euo pipefail
cd "$(dirname "$0")/../.."

API_IMAGE=stepler-api:verify
WEB_IMAGE=stepler-web:verify
NET=stepler-verify
CONTAINERS=(stepler-verify-api stepler-verify-web stepler-verify-badenv)
cleanup() {
  docker rm -f "${CONTAINERS[@]}" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }

# Waits up to $2 seconds for container $1 to reach Docker health "healthy".
wait_healthy() {
  local status=""
  for _ in $(seq 1 "$2"); do
    status=$(docker inspect -f '{{.State.Health.Status}}' "$1")
    [ "$status" = "healthy" ] && return 0
    sleep 1
  done
  fail "$1 not healthy (status: $status)"
}

# Starts image $1 with env args, expects it to exit non-zero within 20 s (fail-fast on bad env).
expect_exit_on_bad_env() {
  local image=$1; shift
  docker run -d --name stepler-verify-badenv "$@" "$image" >/dev/null
  for _ in $(seq 1 20); do
    [ "$(docker inspect -f '{{.State.Running}}' stepler-verify-badenv)" = "false" ] && break
    sleep 1
  done
  [ "$(docker inspect -f '{{.State.Running}}' stepler-verify-badenv)" = "false" ] || fail "$image kept running with invalid env"
  [ "$(docker inspect -f '{{.State.ExitCode}}' stepler-verify-badenv)" != "0" ] || fail "$image exited 0 with invalid env"
  docker rm -f stepler-verify-badenv >/dev/null
}

docker build -f apps/api/Dockerfile -t "$API_IMAGE" .
docker build -f apps/web/Dockerfile -t "$WEB_IMAGE" .

for image in "$API_IMAGE" "$WEB_IMAGE"; do
  [ "$(docker run --rm --entrypoint id "$image" -u)" != "0" ] || fail "$image runs as root"
  # Scan as root so unreadable directories cannot hide files.
  envs=$(docker run --rm -u 0 --entrypoint sh "$image" -c \
    'find / -xdev \( -name ".env" -o -name ".env.*" \) ! -name ".env.example" -print 2>/dev/null | wc -l')
  [ "$envs" -eq 0 ] || fail "$image contains .env files"
  docker run --rm --entrypoint sh "$image" -c 'touch /app/probe 2>/dev/null' && fail "$image app directory is writable by the runtime user"
done

docker run --rm --entrypoint sh "$API_IMAGE" -c 'test -d /app/node_modules/.pnpm' || fail "api image has no node_modules/.pnpm (layout changed?)"
if docker run --rm --entrypoint sh "$API_IMAGE" -c 'ls /app/node_modules/.pnpm | grep -qE "^(vitest|typescript|@nestjs\+cli)@"'; then
  fail "api image contains dev dependencies"
fi

APP_SECRET=$(openssl rand -base64 32)
expect_exit_on_bad_env "$API_IMAGE" --env-file docker/scripts/verify-api.env -e APP_SECRET="$APP_SECRET" -e NODE_ENV=staging
expect_exit_on_bad_env "$WEB_IMAGE" -e API_INTERNAL_URL=not-a-url

docker network create "$NET" >/dev/null
docker run -d --name stepler-verify-api --network "$NET" --env-file docker/scripts/verify-api.env -e APP_SECRET="$APP_SECRET" "$API_IMAGE" >/dev/null
docker run -d --name stepler-verify-web --network "$NET" -p 127.0.0.1:3199:3000 \
  -e API_INTERNAL_URL=http://stepler-verify-api:4000 "$WEB_IMAGE" >/dev/null
wait_healthy stepler-verify-api 30
wait_healthy stepler-verify-web 30

body=$(curl -fsS http://127.0.0.1:3199/api/v1/health/live) || fail "web → api proxy failed"
[ "$body" = '{"status":"ok"}' ] || fail "unexpected health body: $body"

echo "All image checks passed."
