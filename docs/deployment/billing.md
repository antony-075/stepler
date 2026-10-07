# Billing — operating runbook (M1)

Architecture and reasons: ADR 0018 (Proposed). Plan: `docs/superpowers/plans/2026-10-07-billing-and-entitlements.md`. This page covers what exists after PR M1: the trial, read-only, complimentary plans and the retention clock. **There are no payments yet**: nobody can buy anything until M2.

## What happens on release

- The migration `billing_entitlements` seeds the offer catalogue and gives **every existing account a fresh 7-day trial** from the moment it runs ([Q3]). New accounts get theirs at sign-up.
- The trial allows 1 active collection, 1 GiB and 10 additional guest links per collection. After it the account is **read-only**: guests can open the link and see the gallery (if the link shows it) but add nothing; the admin can view, download, archive, delete, revoke links and appeal, but not create or change anything.
- The four `LIMIT_ACTIVE_COLLECTIONS_PER_ACCOUNT`, `LIMIT_STORAGE_BYTES_PER_ACCOUNT`, `LIMIT_STORAGE_BYTES_PER_COLLECTION`, `LIMIT_GUEST_LINKS_PER_COLLECTION` variables are ignored from now on (the API logs a warning at startup while one is set). Remove them from Render.

## Granting a complimentary plan (O3)

1. Sign in with the operator account and open `/ops` → **Тарифи акаунтів** (`/ops/billing/grants`).
2. Type the account's e-mail exactly and press **Знайти**. The panel shows the account's access (Активний / Лише перегляд …) and its plan in force.
3. Choose the plan (draft offers are allowed: «Business» = 20 collections, 1 TiB, 50 links), **Без терміну** or **До дати** (the chosen day is the last day, Kyiv time), then **Надати тариф** and give a reason (operators only see it).
4. The account is active at once; a scheduled deletion of its collections is lifted. **Відкликати тариф** ends it now (if the trial is over, the account is read-only again).

A paid subscription is never replaced by a grant (`409`); that case appears from M3.

## Trying read-only locally

Read-only is a date, so the honest way to see it is to move the date, in your own dev database only:

```sql
-- psql against your local dev database (never staging or production)
UPDATE "User" SET "trialEndsAt" = now() - interval '1 day' WHERE email = 'you@example.com';
```

Reload `/app`: the banner, the disabled buttons and the guest «Колекція доступна лише для перегляду» appear. Grant yourself a plan in `/ops/billing/grants` to undo it (or set `trialEndsAt` back to the future). There is no product backdoor for this.

## Retention clock

- The worker's `billing.retention` job runs daily at 03:17 UTC. It schedules read-only collections for deletion (`deleteAfter` = the end of the trial or plan + `READ_ONLY_RETENTION_MONTHS`, 12; a pack's at its own retention end), e-mails the owner once per read-only episode, sends warnings 30 and 7 days before `deleteAfter`, and lifts all of it when access returns.
- **Deletion is off** (`BILLING_RETENTION_DELETE_ENABLED=false`) until the Terms and Privacy describe retention (M4). With it on, a due collection goes the same way as the admin's own delete (`collection.purge`, audit actor `SYSTEM`, `{reason: 'retention'}`), and never sooner than 7 days after its 7-day warning.

## Prices for staging (later, M2)

M1 seeds the offers **without prices** and inactive (except the trial). Prices are set by the operator in `/ops` from M4; until then, for staging only, the owner may insert them by hand:

```sql
-- [PRICE]: placeholders; amounts are kopecks (49900 = 499,00 грн). Staging only.
INSERT INTO "BillingPrice" ("offerId", "interval", "currency", "amountMinor")
SELECT id, 'ONE_TIME', 'UAH', [PRICE] FROM "BillingOffer" WHERE code = 'pack-start';
UPDATE "BillingOffer" SET active = true WHERE code = 'pack-start';
```

Nothing can be bought in M1 even with prices: checkout arrives in M2.

## Environment

| Variable | Service | Default | Meaning |
|---|---|---|---|
| `READ_ONLY_RETENTION_MONTHS` | worker | `12` | How long read-only content of an account is kept after its trial or plan ended |
| `BILLING_RETENTION_DELETE_ENABLED` | worker | `false` | Lets the retention clock delete due collections; warnings go out either way |

The LiqPay and checkout variables (`BILLING_PROVIDER`, `LIQPAY_*`, …) arrive with M2.
