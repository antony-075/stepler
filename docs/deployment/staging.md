# Staging on Render — setup runbook

Architecture and reasons: ADR 0014. Staging deploys the `stage` branch (docs/development/README.md → Branches and environments). All secrets live in the Render dashboard; never commit or paste them into chat or issues.

The steps below are done once, in this order. `<staging-host>` means the web service's address, `stepler-staging.onrender.com` (Render may add a suffix if the name is taken; the actual host is shown on the service page after step 5).

## 1. Cloudflare R2: bucket and key

1. Cloudflare dashboard → R2 → **Create bucket**: name `stepler-staging`, location **Jurisdiction: European Union**.
2. Bucket → Settings → **CORS policy**, paste this and replace the origin once the host is known (step 5):
   ```json
   [
     {
       "AllowedOrigins": ["https://<staging-host>"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 600
     }
   ]
   ```
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
2. It proposes `stepler-staging-db`, `stepler-staging-api` and `stepler-staging`. Fill in the prompted values:

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

   If Render assigns a different host than expected, update `APP_ORIGIN`, the R2 CORS origin, the Turnstile hostname and the Google redirect URI to the real one.
3. Apply. The first deploy builds both images, runs the migrations (the API's pre-deploy command) and starts the services.

## 6. Deploy flow afterwards

A PR from `dev` to `stage` is a staging deploy. Once it is merged and CI on `stage` is green, Render deploys automatically.

## 7. Verify staging

- `https://<staging-host>/healthz` returns `{"status":"ok"}`, and `/api/v1/health/ready` returns `ok` for both database and storage.
- Magic link sign-in: the email arrives through Brevo, the verify page shows the address, and sign-in lands on `/app`.
- Google sign-in with a test user.
- **Client IP check** (ADR 0014): temporarily set `LIMIT_MAGIC_LINK_PREVIEW_PER_IP_PER_HOUR=3` on the API and redeploy.
  1. Send 4 preview requests from one machine, each with a different spoofed header:
     `curl -X POST -H 'Origin: https://<staging-host>' -H 'Content-Type: application/json' -H 'X-Forwarded-For: 198.51.100.<n>' -H 'CF-Connecting-IP: 198.51.100.<n>' -d '{"token":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}' https://<staging-host>/api/v1/auth/magic-link/preview`
  2. The 4th request must return 429: spoofing does not create new buckets.
  3. The same test from another network must still get 400, not 429: clients do not share one bucket.
  4. Remove the override afterwards.
- The Render logs contain request ids but no cookies, tokens or email addresses.
