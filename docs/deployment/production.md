# Production on Render — setup runbook

Architecture and reasons: ADR 0014 (addendum 2026-10-20). Production deploys the `main` branch from its own Blueprint, `render.production.yaml`. Nothing is shared with staging: database, bucket, Turnstile widget, Google client, mail sender and every secret are new (rule 17). All secrets live in the Render dashboard; never commit or paste them into chat or issues.

**Status: prepared, not created.** Nothing below has been run yet. Production is created once the launch blockers it depends on are closed.

## 0. Before you start

These come first, because production refuses to start or is not usable without them:

| Needed | Why | Launch item |
| --- | --- | --- |
| The domain, with DNS you control | `APP_ORIGIN`, Turnstile, Google redirect, mail sender | 1.2 |
| Mail from the domain (SPF, DKIM, DMARC) | sign-in links must not land in spam | 1.3 |
| Published legal texts | the web server refuses to start on draft texts ([C20]); there is no `LEGAL_ALLOW_DRAFT` in production | 1.5 |
| Live LiqPay keys and the accountant's answer on receipts | with live keys the API and the worker refuse to start unless `BILLING_FISCAL_MODE=liqpay_rro` or `BILLING_FISCAL_WAIVED=true` ([P14], [Q1]) | 1.4 |
| The sandbox payment check on staging | the live keys must not be the first real test | 1.6 |

`<domain>` below is the production host, e.g. `stepler.ua`.

## 1. Sizes and cost

The sizes come from the staging load test (2026-10-20, 150 guests × 4 photos on one link from one IP). The 0.1-CPU database failed it (500s at 100 % CPU). `0.5c-1g` with a `1c-2g` worker that processes three photos at once passed with 0 errors: database CPU peaked at 28 % (22 connections), worker at 55 % CPU and 370 MB, and the last photo was ready under 4 minutes after the last upload.

| Resource | Plan | About per month (Render prices, October 2026) |
| --- | --- | --- |
| `stepler-db` | `0.5c-1g`, 5 GB disk | $19 + disk |
| `stepler-worker` | `1c-2g`, `WORKER_MEDIA_CONCURRENCY=3` | $25 |
| `stepler-api` | `0.5c-512mb` | $7 |
| `stepler-web` | `0.5c-512mb` | $7 |

About $60 a month before bandwidth and R2. Confirm the amounts Render shows before you apply. Not yet measured: 48 MP HEIC photos with three at once. If the worker's memory approaches 1.5 GB, set `WORKER_MEDIA_CONCURRENCY=2`.

## 2. Providers (same steps as staging, new resources)

1. **R2.** Bucket `stepler-production`, **Jurisdiction: European Union**. Token with **Object Read & Write** on that bucket only. CORS and the lifecycle rule as in staging step 9, with `https://<domain>` as the only allowed origin.
2. **Turnstile.** A new widget "Stepler", hostname `<domain>`, mode **Managed**.
3. **Mail.** In Brevo, add the domain (**Senders, domains & dedicated IPs → Domains**) and add the DNS records it shows (DKIM, the Brevo code, DMARC); add an SPF record if the domain has none. Sender e.g. `Stepler <hello@<domain>>`. Check that a sign-in mail reaches Gmail's inbox, not spam.
4. **Google OAuth.** A new client "Stepler", redirect URI `https://<domain>/api/v1/auth/google/callback`. Move the app from **Testing** to **In production** (Google Auth Platform → Audience), or only test users can sign in.
5. **Operator mailbox.** The service mailbox (`moderation@<domain>`) registered on production once, as on staging (step 10).

## 3. Render: create the Blueprint

1. Render → **New → Blueprint**, repository `antony-075/stepler`, branch **`main`**, **Blueprint Path `render.production.yaml`**. Name the Blueprint `stepler-production`.
2. Render proposes `stepler-db`, `stepler-api`, `stepler-worker` and `stepler-web`. Fill in the prompted values. The API and the worker each ask for theirs; Render cannot copy values between services, so enter the shared ones on both.

   | Variable | Value |
   | --- | --- |
   | `APP_ORIGIN` | `https://<domain>` (no trailing slash) |
   | `SMTP_URL`, `MAIL_FROM` | from step 2.3 |
   | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | from step 2.2 |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from step 2.4 |
   | `OPERATOR_EMAILS` | the service mailbox from step 2.5 |
   | `LEGAL_CONTACT_EMAIL` | the published privacy/abuse address (also on the web service) |
   | `BILLING_PROVIDER` | `liqpay` |
   | `LIQPAY_PUBLIC_KEY`, `LIQPAY_PRIVATE_KEY` | the **live** pair |
   | `BILLING_CALLBACK_URL` | `https://<domain>/api/v1/billing/liqpay/callback` |
   | `BILLING_FISCAL_MODE` / `BILLING_FISCAL_WAIVED` | `liqpay_rro`, or leave the mode empty and set `BILLING_FISCAL_WAIVED=true`, as the accountant decides |
   | `S3_ENDPOINT` | `https://<account-id>.eu.r2.cloudflarestorage.com` |
   | `S3_BUCKET` | `stepler-production` |
   | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | from step 2.1 |

   `SEARCH_INDEXING=on` and `WORKER_MEDIA_CONCURRENCY=3` come from the Blueprint. `BILLING_RETENTION_DELETE_ENABLED` stays `false` until you confirm the published texts describe deletion after retention (ADR 0018 [P6]).
3. Apply. The first deploy builds the images, runs the migrations and starts the services.
4. **stepler-web → Settings → Custom Domains**: add `<domain>` (and `www.<domain>` if you want it to redirect). Add the DNS records Render shows and wait until the certificate is issued.

## 4. Deploy flow

Like staging: manual, API first, then the worker, then the web.

1. The release PR `stage` → `main` is merged after the same release on staging was checked.
2. `pnpm deploy:production` from the repository root deploys the tip of `origin/main` in that order and stops at the first failure. `--dry-run` shows the plan; `--only` works as on staging.
3. A release with a destructive migration: first export the database (section 6), then deploy.

## 5. Verify

On `https://<domain>`, the staging checks (staging step 7), plus:

- the client-IP spoofing check (staging step 7) on the custom domain;
- the page source has no `noindex`, and `/robots.txt` allows indexing;
- a sign-in mail arrives in the inbox (not spam) with the domain sender;
- one real payment with the smallest pack, then its refund in the LiqPay dashboard; a receipt arrives if `liqpay_rro` is on;
- one guest upload of a photo from a phone, processed within a minute.

## 6. Backups and restore

**Database.** Render keeps point-in-time recovery for every paid database: **3 days back** on the Hobby workspace (what staging has; confirmed via the Render API on 2026-10-20), **7 days** on Pro. Recovery never overwrites the database: Render creates a **new** database at the chosen time (not within the last 10 minutes), which is checked first and then connected to the services.

On top of that, **exports** (Render → `stepler-db` → Recovery → Export, or the Render API) are logical dumps kept for 7 days and downloadable. Make one before every release with a destructive migration.

Restore, when needed:

1. Render → `stepler-db` → **Recovery → Restore**, choose the time. Render creates `stepler-db-<…>`, billed like the original while it exists.
2. Check it from the `stepler-api` shell: `psql "<the new database's internal URL>"`, the row counts and the newest rows of `"Collection"` and `"Content"`.
3. Suspend `stepler-worker`. Set `DATABASE_URL` on `stepler-api` and `stepler-worker` to the new database, deploy both, resume the worker.
4. Once it works, delete the old database. The Blueprint still names `stepler-db`: rename the new one in the dashboard, or update the Blueprint, so the next sync does not create another database.

**The restore drill is still owed** (launch item 3.3): run steps 1–2 once on staging and delete the copy afterwards. It costs a few cents (one 0.1-CPU database for an hour) and needs the owner's OK.

**Media (R2) has no backup.** The bucket holds the only copy of every original, and R2 has no object versioning. The app deletes only on purpose (deletion, retention, purge). The risks are a mistaken bulk delete and a leaked key. They are reduced by the token being limited to this bucket and kept only in Render. A second copy (a scheduled copy to another bucket) is a post-launch decision with its own cost.
