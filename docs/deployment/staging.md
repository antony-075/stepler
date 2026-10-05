# Staging on Render — setup runbook

Architecture and reasons: ADR 0014. Staging deploys the `stage` branch (docs/development/README.md → Branches and environments). All secrets live in the Render dashboard; never commit or paste them into chat or issues.

The steps below are done once, in this order. `<staging-host>` means the web service's address. Use `stepler-staging.onrender.com` from the start: Render derives it from the service name and adds a suffix only if that name is taken. After step 5 the real host is shown on the service page. If it differs, update `APP_ORIGIN` in Render, the Turnstile hostname and the Google redirect URI; all three can be edited later.

## 1. Cloudflare R2: bucket and key

1. Cloudflare dashboard → R2 → **Create bucket**: name `stepler-staging`, location **Jurisdiction: European Union**.
2. CORS and the multipart lifecycle rule are set later, in step 9 (they are needed only once browsers upload straight to the bucket).
3. R2 → **Manage R2 API tokens** → Create token. Permission **Object Read & Write**, applied to the `stepler-staging` bucket only. Keep the Access Key ID and Secret Access Key for step 5.
4. The S3 endpoint for an EU-jurisdiction bucket is `https://<account-id>.eu.r2.cloudflarestorage.com`.

## 2. Cloudflare Turnstile

Cloudflare dashboard → Turnstile → **Add widget**: name "Stepler staging", hostname `<staging-host>`, mode **Managed**. Keep the site key and the secret key.

## 3. Brevo SMTP

1. Create a Brevo account. Under **Senders, domains & dedicated IPs**, add and verify the sender address that staging mail comes from.
   Without our own domain, this is an address you own. Mail may land in spam until a domain with SPF/DKIM is set up; this is fine for staging.
2. **SMTP & API → SMTP**: note the login and create an **SMTP key**.
3. Staging values:
   - `SMTP_URL`: `smtp://<login>:<smtp-key>@smtp-relay.brevo.com:587`, with the login and key URL-encoded (e.g. `@` → `%40`). Port 587 upgrades to TLS (STARTTLS).
   - `MAIL_FROM`: `Stepler Staging <verified-sender@example.com>`

## 4. Google OAuth client for staging

In the same Google Cloud project, go to Google Auth Platform → **Clients → Create client**, type **Web application**, name "Stepler staging". Authorized redirect URI: `https://<staging-host>/api/v1/auth/google/callback`. Keep the client ID and secret.

While the app is in Testing mode, only the listed test users can sign in.

## 5. Render: create the Blueprint

1. Render dashboard → **New → Blueprint**. Connect the GitHub repository `antony-075/stepler` and choose branch **`stage`**. Render reads `render.yaml`.
2. It proposes `stepler-staging-db`, `stepler-staging-api` and `stepler-staging` (and, once Phase 4 PR B is on `stage`, `stepler-staging-worker`: see step 8). Fill in the prompted values:

   | Variable | Value |
   | --- | --- |
   | `APP_ORIGIN` | `https://<staging-host>` (no trailing slash) |
   | `SMTP_URL`, `MAIL_FROM` | from step 3 |
   | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | from step 2 |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from step 4 (leave both empty to hide Google) |
   | `OPERATOR_EMAILS` | your email, or empty |
   | `S3_ENDPOINT` | `https://<account-id>.eu.r2.cloudflarestorage.com` |
   | `S3_BUCKET` | `stepler-staging` |
   | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | from step 1 |
   | `LEGAL_CONTACT_EMAIL` | the privacy/abuse contact shown on `/legal/*`; a placeholder such as `privacy@example.com` is fine on staging (owner action E1 of the slice 10 plan). `LEGAL_ALLOW_DRAFT=true` comes from `render.yaml`: staging may run on the placeholder legal texts, production never does |

   If Render assigns a different host than expected, update `APP_ORIGIN`, the Turnstile hostname and the Google redirect URI to the real one.
3. Apply. The first deploy builds both images, runs the migrations (the API's pre-deploy command) and starts the services.

## 6. Deploy flow afterwards

Staging deploys are **manual** (owner decision 2026-10-05: GitHub Actions minutes are limited, so CI can't gate every deploy). `render.yaml` sets `autoDeployTrigger: "off"` on the three staging services.

1. Before the release, run the full check locally on the release commit: `pnpm release:check` (format, lint, typecheck, unit and integration tests, builds, Storybook, the three-browser e2e, the Docker image checks; needs `pnpm infra:up`). The release PR `dev` → `stage` lists its result. If CI minutes are available, CI on the release PR runs the same full matrix.
2. Merge the release PR into `stage`.
3. Render → **Manual Deploy → Deploy latest commit**, in this order:
   1. `stepler-staging-api` — its pre-deploy command applies the database migrations;
   2. `stepler-staging-worker`;
   3. `stepler-staging` (web).
   Deploy them back to back; the web and API share contracts.
4. Verify (section 7): `/healthz`, `/api/v1/health/ready`, sign-in, and the release's own checks.

### Release notes

- **Collection image and contraction (PR L, ADR 0017).** The migration `20261005130030_drop_slice_8a_cover` **drops** the slice 8a `CollectionCover` table, the `CoverStatus` and `CoverSource` types and `Collection.welcomeMessage`. Their data has lived in `CollectionImage` and `GuestPageVersion` since PR I. The worker no longer serves the slice 8a job names. Order: **suspend `stepler-staging-worker`**, deploy `stepler-staging-api` (its pre-deploy applies the migration), then **resume and deploy** `stepler-staging-worker`, then `stepler-staging` (web). The migration refuses to run, and changes nothing, if a `media.cover-derivatives` or `cover.purge` job is still waiting, if the PR I backfill did not cover the database, or if the old table or column was written after it. If it refuses, the API deploy fails before the new API starts. If this release also brings PR I, release PR I first, and let its worker finish the slice 8a jobs (Render logs: no `media.cover-derivatives` left). Otherwise read the error in the deploy log. There is no rollback of the dropped table: restore from the database backup if one is ever needed. No new env var and no bucket change. Check afterwards:
  - a collection with a guest page cover still shows it on the guest page;
  - in «Параметри колекції» → «Картинка колекції», an uploaded image becomes ready and shows on the dashboard card;
  - after «Прибрати», the card shows the initials again.

- **Guest page templates storage (PR I, ADR 0017).** The migration `20261005072838_guest_page_templates` copies every cover into `CollectionImage` (same ids) and every collection's welcome into a published `GuestPageVersion`, and the API and worker read only the new tables from this release. A worker of the old version would process cover jobs against the old table while the new API writes the new one, so for this release: **suspend `stepler-staging-worker`** (Render → the service → Suspend), then deploy `stepler-staging-api` (its pre-deploy applies the migration), then **resume and deploy** `stepler-staging-worker`, then `stepler-staging` (web). Jobs queued meanwhile wait in PostgreSQL and run once the new worker starts (the slice 8a job names stay served). An image whose job was lost anyway is marked `FAILED` by the hourly sweep after an hour, and the owner can set it again. Check afterwards: a collection with a cover still shows it on the dashboard and the guest page, and a new cover set in «Гостьова сторінка» becomes ready.

- **Legal acceptance (slice 10, PR F2, ADR 0016).** From this release `GET /auth/methods` returns `legal`, `POST /auth/magic-link` requires it and `GET /auth/google/start` requires `terms`/`privacy`. Render deploys `stepler-staging` (web) and `stepler-staging-api` independently, and both sides read `/auth/methods` with a strict schema, so **in either order** the sign-in card shows «Вхід тимчасово недоступний. Спробуйте пізніше.» until both services run the new version (old web: the new `legal` field is unknown; new web: the field is missing). Nothing is written in that window. Deploy them back to back (Render → each service → Manual Deploy if needed) and check `/login` afterwards; on staging the short window is acceptable. Accounts created before this release see `/accept-terms` once after signing in.

## 7. Verify staging

- `https://<staging-host>/healthz` returns `{"status":"ok"}`, and `/api/v1/health/ready` returns `ok` for both database and storage.
- Magic link sign-in: the email arrives through Brevo, the verify page shows the address, and sign-in lands on `/app`.
- Google sign-in with a test user.
- **Client IP check** (ADR 0014): temporarily set `LIMIT_MAGIC_LINK_PREVIEW_PER_IP_PER_HOUR=3` on the API and redeploy.
  1. Send 4 preview requests from one machine, each with a different spoofed header:
     `curl -X POST -H 'Origin: https://<staging-host>' -H 'Content-Type: application/json' -H 'X-Forwarded-For: 198.51.100.<n>' -H 'CF-Connecting-IP: 198.51.100.<n>' -d '{"token":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}' https://<staging-host>/api/v1/auth/magic-link/preview`
  2. The 4th request must return 429: spoofing does not create new buckets. (A client-sent `CF-Connecting-IP` is rejected by Cloudflare with 403, error 1000.)
  3. The same test from another network must still get 400, not 429: clients do not share one bucket. On a phone on mobile data, opening `https://<staging-host>/auth/verify?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` must show "link invalid", not "too many attempts".
  4. Remove the override afterwards.
- The Render logs contain request ids but no cookies, tokens or email addresses.
- **Location stripping** (ADR 0008 addendum 2026-10-05; after promoting it, with the worker image rebuilt): run step 8 of the staging smoke checklist in `docs/development/README.md`, including a MOV of about 2 GB, which needs about 4 GB of temp disk on the worker. Record the result (disk, time, R2 `If-Match`) in the addendum.

## 8. Background worker (before promoting Phase 4 PR B to `stage`)

The worker runs background jobs: it purges deleted content and deleted collections (including collections deleted before the worker existed) and cleans up long-idle guest sessions. Later it also makes previews. Architecture: ADR 0009; hosting: ADR 0014, "Addendum: staging worker".

1. When the `dev` → `stage` PR that contains the worker is merged, Render shows a pending Blueprint change: **Blueprints → stepler → Sync** (or the banner on the dashboard). It adds the background worker **`stepler-staging-worker`**: Frankfurt, branch `stage`, deploy after CI passes, image `apps/api/worker.Dockerfile`.
2. Plan **`0.5c-512mb`** (0.5 CPU / 512 MB), the same as the API. Background workers have no free tier: confirm the monthly cost shown by Render before you approve.
3. Render asks for the worker's 4 secret values. Copy them from the API service (**stepler-staging-api → Environment**, reveal each value), because Render cannot share values between services:

   | Variable | Value |
   | --- | --- |
   | `S3_ENDPOINT` | same as the API: `https://<account-id>.eu.r2.cloudflarestorage.com` |
   | `S3_BUCKET` | same as the API: `stepler-staging` |
   | `S3_ACCESS_KEY_ID` | same as the API |
   | `S3_SECRET_ACCESS_KEY` | same as the API |

   `DATABASE_URL`, `NODE_ENV`, `LOG_LEVEL` and `S3_REGION` come from the Blueprint. Optional tuning (`WORKER_PURGE_BATCH_SIZE`, `GUEST_SESSION_IDLE_DAYS`, `WORKER_MEDIA_CONCURRENCY`; docs/development/README.md) can be added later; the defaults are meant for staging.
4. Apply. The worker runs the migrations (pre-deploy, like the API) and starts.
5. Check: **stepler-staging-worker → Logs** contains a line with `"msg":"worker started"` within a minute of the deploy. Within the next hour (at minute :07) a `"msg":"maintenance.sweep done"` line appears. A collection deleted earlier on staging is then gone from the database: the sweep re-enqueues its purge.

If `worker started` is missing, the log shows why: an env error names the missing variable (never its value); a database error means `DATABASE_URL` is wrong.

## 9. R2 for direct uploads (before promoting Phase 4 uploads to `stage`)

Browsers upload straight to the bucket with short-lived signed URLs (ADR 0003, 0008). Do this before the upload slice reaches staging; it is harmless earlier.

1. Cloudflare dashboard → R2 → `stepler-staging` → **Settings → CORS policy → Add CORS policy**, JSON:
   ```json
   [
     {
       "AllowedOrigins": ["https://stepler-staging.onrender.com"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   If the staging host is different (step 5), use the real one. No wildcard origins or headers: uploads send only `Content-Type`, and the browser must be able to read `ETag` for multipart parts.
2. Same bucket → **Settings → Object lifecycle rules → Add rule**: name `abort-incomplete-multipart`, applies to the whole bucket (no prefix), action **Abort incomplete multipart uploads** after **2 days**. This is the safety net for uploads the app could not abort itself (spec §10.5); the app aborts cancelled and expired uploads on its own.

Last full verification: 2026-09-30 (ADR 0014, "Staging verified").
