#!/usr/bin/env bash
# Builds the production images and checks the properties CI relies on.
set -euo pipefail
cd "$(dirname "$0")/../.."

API_IMAGE=stepler-api:verify
WORKER_IMAGE=stepler-worker:verify
WEB_IMAGE=stepler-web:verify
NET=stepler-verify
CONTAINERS=(stepler-verify-api stepler-verify-worker stepler-verify-web stepler-verify-badenv stepler-verify-db)
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
docker build -f apps/api/worker.Dockerfile -t "$WORKER_IMAGE" .
docker build -f apps/web/Dockerfile -t "$WEB_IMAGE" .

for image in "$API_IMAGE" "$WORKER_IMAGE" "$WEB_IMAGE"; do
  [ "$(docker run --rm --entrypoint id "$image" -u)" != "0" ] || fail "$image runs as root"
  # Scan as root so unreadable directories cannot hide files.
  envs=$(docker run --rm -u 0 --entrypoint sh "$image" -c \
    'find / -xdev \( -name ".env" -o -name ".env.*" \) ! -name ".env.example" -print 2>/dev/null | wc -l')
  [ "$envs" -eq 0 ] || fail "$image contains .env files"
  docker run --rm --entrypoint sh "$image" -c 'touch /app/probe 2>/dev/null' && fail "$image app directory is writable by the runtime user"
done

for image in "$API_IMAGE" "$WORKER_IMAGE"; do
  docker run --rm --entrypoint sh "$image" -c 'test -d /app/node_modules/.pnpm' || fail "$image has no node_modules/.pnpm (layout changed?)"
  if docker run --rm --entrypoint sh "$image" -c 'ls /app/node_modules/.pnpm | grep -qE "^(vitest|typescript|@nestjs\+cli)@"'; then
    fail "$image contains dev dependencies"
  fi
done

# Media tools (spike S5), as the runtime user: the HEVC decoder for HEIC and ffmpeg's video
# decoders in the worker image; neither in the API image.
docker run --rm --entrypoint sh "$WORKER_IMAGE" -c 'heif-convert --list-decoders | grep -q libde265' \
  || fail "$WORKER_IMAGE: heif-convert has no libde265 (HEIC) decoder"
for codec in hevc h264; do
  docker run --rm --entrypoint sh "$WORKER_IMAGE" -c "ffmpeg -hide_banner -decoders | grep -qE ' $codec '" \
    || fail "$WORKER_IMAGE: ffmpeg has no $codec decoder"
done
for tool in ffmpeg ffprobe heif-convert; do
  docker run --rm --entrypoint sh "$API_IMAGE" -c "command -v $tool" >/dev/null && fail "$API_IMAGE contains $tool"
done
# The worker's own media code against those tools and the image's sharp: a generated HEIC
# decoded to WebP previews, and a poster from an MP4 that ffmpeg reads over HTTP (as from a
# presigned URL), with its duration.
media=$(docker run --rm --entrypoint sh "$WORKER_IMAGE" -c '
  set -e
  cd /tmp
  ffmpeg -v error -f lavfi -i "testsrc2=size=320x240:rate=1" -frames:v 1 src.png
  heif-enc -q 50 src.png -o photo.heic >/dev/null
  ffmpeg -v error -f lavfi -i "testsrc=size=320x240:rate=25" -t 1 -c:v libx264 -pix_fmt yuv420p clip.mp4
  node --input-type=module -e "
    import { createServer } from \"node:http\";
    import { readFileSync } from \"node:fs\";
    const { decodeHeic } = await import(\"file:///app/dist/worker/media/decode.js\");
    const { renderDerivatives } = await import(\"file:///app/dist/worker/media/images.js\");
    const { probeVideo, extractFrame } = await import(\"file:///app/dist/worker/media/ffmpeg.js\");
    const photo = await renderDerivatives(await decodeHeic(\"/tmp/photo.heic\", \"/tmp\"), { autoOrient: false });
    if (photo.large.width !== 320 || photo.large.height !== 240) throw new Error(\"HEIC preview size\");
    const server = createServer((req, res) => res.end(readFileSync(\"/tmp/clip.mp4\")));
    await new Promise((resolve) => server.listen(0, \"127.0.0.1\", resolve));
    const url = \"http://127.0.0.1:\" + server.address().port + \"/clip.mp4\";
    const probe = await probeVideo(url);
    if (Math.abs(probe.durationMs - 1000) > 100 || probe.width !== 320) throw new Error(\"probe \" + JSON.stringify(probe));
    const poster = await renderDerivatives(await extractFrame(url, 0.5), { autoOrient: false });
    if (poster.large.width !== 320) throw new Error(\"poster size\");
    server.close();
    console.log(\"media ok\");
  "
' 2>&1) || true
echo "$media" | grep -q '^media ok$' || fail "$WORKER_IMAGE: media smoke test failed: $media"

APP_SECRET=$(openssl rand -base64 32)
expect_exit_on_bad_env "$API_IMAGE" --env-file docker/scripts/verify-api.env -e APP_SECRET="$APP_SECRET" -e NODE_ENV=staging
expect_exit_on_bad_env "$WORKER_IMAGE" -e NODE_ENV=production -e DATABASE_URL=not-a-url
expect_exit_on_bad_env "$WEB_IMAGE" -e API_INTERNAL_URL=not-a-url

docker network create "$NET" >/dev/null

# Migrations run from the production API image (the platform's pre-deploy command, ADR 0014):
# the first run applies every migration, a second run finds nothing to do.
docker run -d --name stepler-verify-db --network "$NET" -e POSTGRES_USER=verify -e POSTGRES_PASSWORD=verify \
  -e POSTGRES_DB=verify --health-cmd "pg_isready -U verify -d verify" --health-interval 1s \
  postgres:18.6 >/dev/null
wait_healthy stepler-verify-db 30
migrate() {
  docker run --rm --network "$NET" -e DATABASE_URL=postgresql://verify:verify@stepler-verify-db:5432/verify \
    "$API_IMAGE" node_modules/.bin/prisma migrate deploy 2>&1
}
first=$(migrate) || fail "migrate deploy failed in the api image: $first"
echo "$first" | grep -q "migrations have been successfully applied\|All migrations have been successfully applied" \
  || fail "migrate deploy did not apply migrations: $first"
second=$(migrate) || fail "second migrate deploy failed: $second"
echo "$second" | grep -q "No pending migrations" || fail "second migrate deploy was not a no-op: $second"
# Prisma must find OpenSSL, or it guesses an engine that can break on the next migration.
echo "$first" | grep -qi "failed to detect the libssl" && fail "prisma cannot detect OpenSSL in the api image"
docker run -d --name stepler-verify-api --network "$NET" --env-file docker/scripts/verify-api.env -e APP_SECRET="$APP_SECRET" "$API_IMAGE" >/dev/null
docker run -d --name stepler-verify-web --network "$NET" -p 127.0.0.1:3199:3000 \
  -e API_INTERNAL_URL=http://stepler-verify-api:4000 "$WEB_IMAGE" >/dev/null
wait_healthy stepler-verify-api 30
wait_healthy stepler-verify-web 30

# The worker needs only the database to start (pg-boss installs its schema); S3 is not contacted
# until a job runs, so placeholder storage values are enough here.
docker run -d --name stepler-verify-worker --network "$NET" \
  -e DATABASE_URL=postgresql://verify:verify@stepler-verify-db:5432/verify \
  -e S3_REGION=auto -e S3_BUCKET=placeholder -e S3_ACCESS_KEY_ID=placeholder \
  -e S3_SECRET_ACCESS_KEY=placeholder "$WORKER_IMAGE" >/dev/null
started=""
for _ in $(seq 1 30); do
  if docker logs stepler-verify-worker 2>&1 | grep -q '"msg":"worker started"'; then started=yes; break; fi
  [ "$(docker inspect -f '{{.State.Running}}' stepler-verify-worker)" = "true" ] || break
  sleep 1
done
[ -n "$started" ] || fail "worker did not log 'worker started' within 30 s: $(docker logs --tail 20 stepler-verify-worker 2>&1)"
# SIGTERM stops it gracefully, well before Docker's 10 s SIGKILL.
docker stop stepler-verify-worker >/dev/null
[ "$(docker inspect -f '{{.State.ExitCode}}' stepler-verify-worker)" != "137" ] || fail "worker ignored SIGTERM and was killed"

body=$(curl -fsS http://127.0.0.1:3199/api/v1/health/live) || fail "web → api proxy failed"
[ "$body" = '{"status":"ok"}' ] || fail "unexpected health body: $body"

echo "All image checks passed."
