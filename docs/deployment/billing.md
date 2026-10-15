# Billing — operating runbook (M1–M3)

Architecture and reasons: ADR 0018 (Proposed). Plan: `docs/superpowers/plans/2026-10-07-billing-and-entitlements.md`. This page covers the trial, read-only, complimentary plans and the retention clock (M1), **one-time packs paid by card through LiqPay** (M2) and **subscriptions** (M3). The `/ops` price editor and refunds arrive with M4.

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

## Packs and payments (M2)

- **What can be bought:** the active `PACK` offers («Старт», «Подія») for one collection or for a new one, and, for a pack collection, «Продовжити збір на 30 днів», «Продовжити зберігання на рік» and «Збільшити обсяг» (the difference between the two tiers' current prices). Public price list: `/pricing`; buying: «Тариф і оплата» (`/app/billing`) or a collection's page.
- **How a payment goes:** the API prices the checkout and returns LiqPay's signed form; the browser posts it to LiqPay; LiqPay calls `POST /api/v1/billing/liqpay/callback` (`BILLING_CALLBACK_URL`) and sends the payer back to `/app/billing/return?payment=…`. The return page asks our API, which asks LiqPay's `status` API while the payment is pending, so a payment settles even without a callback. The worker's `billing.reconcile` job (every 10 minutes) does the same for pending payments, expires checkouts nobody paid (30 minutes + 15) and re-applies stored callbacks whose processing failed.
- **A declined card** (LiqPay's anti-fraud, a bank refusal) sends no callback and LiqPay keeps the order payable: the return page says «Оплату ще не підтверджено» after 20 seconds and offers to pay the same order again.
- **Payments off:** with `BILLING_PROVIDER=disabled` (the default) checkout answers `503 PAYMENT_PROVIDER_UNAVAILABLE` and nothing is granted; `/pricing` still lists the prices.

### Prices (until the `/ops` editor, M4)

Offers are seeded **inactive and without prices**. For staging (and your local dev database), insert prices by hand ([Q10]: the owner's prices are not decided yet):

```sql
-- [PRICE]: placeholders; amounts are kopecks (49900 = 499,00 ₴). Never on production by hand.
INSERT INTO "BillingPrice" ("offerId", "interval", "currency", "amountMinor")
SELECT o.id, 'ONE_TIME', 'UAH', v.amount FROM "BillingOffer" o
JOIN (VALUES ('pack-start', [PRICE]), ('pack-event', [PRICE]), ('ext-window-30', [PRICE]), ('ext-retention-365', [PRICE])) AS v(code, amount) ON v.code = o.code;
UPDATE "BillingOffer" SET active = true WHERE code IN ('pack-start', 'pack-event', 'ext-window-30', 'ext-retention-365');
```

To change a price, set the old row `active = false` and insert a new one (payments keep pointing at the price they were made with). `ext-storage` has no price of its own.

### LiqPay sandbox on your laptop (O1)

1. In the LiqPay cabinet copy the **sandbox** key pair (it starts with `sandbox_`) into `apps/api/.env` yourself: `LIQPAY_PUBLIC_KEY=…`, `LIQPAY_PRIVATE_KEY=…`, and add `BILLING_PROVIDER=liqpay`. Restart `pnpm dev` and `pnpm worker:dev` (the worker reads the same file).
2. Price the packs in your dev database (the SQL above).
3. Without a tunnel, LiqPay cannot reach your API: payments settle through the `status` API instead (the return page and the worker). To receive real callbacks, run `pnpm dev:tunnel` instead of `pnpm dev` (needs `cloudflared`); stop it when done.
4. Buy: `/app/billing` → «Купити» → choose a collection or «Нова колекція» → «Перейти до оплати». LiqPay's page shows «Тестовий режим». Card `4242 4242 4242 4242`, any future date, CVV `123`, any first and last name → success; then press «Повернутися на сайт». `4000 0000 0000 0002` is refused by LiqPay's anti-fraud (no callback; try again on the return page).

### Staging (O2)

Set on **both** `stepler-api-staging` and the worker in Render (`sync: false`): `BILLING_PROVIDER=liqpay`, `LIQPAY_PUBLIC_KEY`, `LIQPAY_PRIVATE_KEY` (the sandbox pair; live keys never on staging), and on the API `BILLING_CALLBACK_URL=https://<staging-api-host>/api/v1/billing/liqpay/callback`. Price the offers with the SQL above. Production refuses to start with live keys and `BILLING_FISCAL_MODE=none` unless `BILLING_FISCAL_WAIVED=true` ([Q1], accountant).

### What the operator sees

Until M4's payment list, a payment is diagnosed in the database: `Payment` (status, `mismatch` = LiqPay reported another amount, `needsReview` = paid but nothing could be granted, e.g. a second pack for the same collection — refund it) and `PaymentEvent` (each verified callback once: whitelisted fields, outcome, processing error). Logs: `billing.callback`, `billing.checkout`, `billing.payment.*`, `billing.reconcile`; never data, signatures, keys or card data.

## Subscriptions (M3)

- **What can be bought:** the active `SUBSCRIPTION` offers («Pro», «Business»), monthly or yearly, on «Тариф і оплата» (`/app/billing`, «Підписка для організаторів подій»); `/pricing` lists them and sends a signed-in owner to that page's dialog (`?plan=<priceId>`). The dialog requires the auto-renewal consent; the API records when it was given and the terms version.
- **How it is charged:** a LiqPay recurring checkout (`action: subscribe`) charges the first period at once (reported as `subscribed`, spike S1b); LiqPay then charges every period itself (`action: regular` callbacks, one `Payment` each). The period runs from our payment; LiqPay's schedule runs from the checkout, a few minutes earlier.
- **Renewal not seen:** an hour after the period end the reconcile job asks LiqPay's `status`; still nothing → `PAST_DUE` (grace for `BILLING_GRACE_DAYS`, the «не вдалося списати» mail once, banners), checked hourly; after the grace, and only if LiqPay answered within the last hour → `EXPIRED`, LiqPay unsubscribed, the account read-only (retention as for a trial). LiqPay unreachable → nothing expires (log `billing.subscription.expiry_deferred`).
- **Pay now in grace:** «Оплатити зараз» on the «Підписка» card unsubscribes the old LiqPay order first (LiqPay unreachable → `503`, nothing changes), then a new recurring checkout of the same plan; its period starts at the payment.
- **Cancel:** LiqPay is unsubscribed first; only then is the plan `CANCELED` (access to the period end). LiqPay unreachable → `503`, nothing changes. «Відновити» is a new checkout whose first period starts when the cancelled one ends.
- **Upgrade:** a prorated one-time charge (waived under `BILLING_MIN_CHARGE_MINOR`), the new limits at once, the new price sent to LiqPay with `subscribe_update` (retried by the job until it confirms).
- **Downgrade:** only when the account's usage fits; LiqPay is told the lower price at once and the plan switches with the first charge at that price. «Скасувати зміну» restores the price.
- **Monthly ↔ yearly (B14):** scheduled, nothing charged. In the last 24 h of the period the job unsubscribes the old LiqPay subscription (log `billing.subscription.switch_stopped`); the plan runs to its end, then into grace with one «підтвердіть оплату» mail and a banner on «Тариф і оплата»; the owner pays the new plan through a normal checkout. Not paid by the end of the grace → read-only as usual.

### Prices for plans

```sql
-- [PRICE]: placeholders, kopecks. Never on production by hand.
INSERT INTO "BillingPrice" ("offerId", "interval", "currency", "amountMinor")
SELECT o.id, v.interval::"BillingInterval", 'UAH', v.amount FROM "BillingOffer" o
JOIN (VALUES ('sub-pro', 'MONTH', [PRICE]), ('sub-pro', 'YEAR', [PRICE]), ('sub-business', 'MONTH', [PRICE]), ('sub-business', 'YEAR', [PRICE])) AS v(code, interval, amount) ON v.code = o.code;
UPDATE "BillingOffer" SET active = true WHERE code IN ('sub-pro', 'sub-business');
```

### Subscribing locally (sandbox)

With the sandbox keys and plan prices in place (above): `/app/billing` → «Оформити» on a plan → tick the auto-renewal consent → «Перейти до оплати» → card `4242 4242 4242 4242`. LiqPay's page shows the periodicity and the first charge date. With `pnpm dev:tunnel` the `subscribe` callback arrives at once; without it the return page settles the payment through `status`. Cancel from the «Підписка» card when done, so the sandbox stops charging. Grace and expiry can be tried without waiting by moving `currentPeriodEnd` back in your dev database and running the worker.

### When a renewal needs review

`Payment.needsReview = true` on a `SUBSCRIPTION_RENEWAL` (or a start) means LiqPay took money that could not be applied as expected: an amount other than the plan's price (`mismatch`), a charge on a plan that had ended or been cancelled, a charge on a plan already stopped for a monthly ↔ yearly switch, or a second paid plan on the same account (the stacked one is ended and unsubscribed by the job). The operator checks the account's `Subscription` rows and the `PaymentEvent` of that charge, then refunds it in the LiqPay cabinet (M4 brings refunds into `/ops`) or leaves it when the charge was right (e.g. a renewal at the old price before `subscribe_update` was confirmed). A renewal callback that never arrived (LiqPay's `status` may not report `regular` charges, ADR 0018) shows as a paying owner in grace: find the charge in the LiqPay cabinet and, until M4, ask a developer to replay it.

### The spike's daily renewal (closed 2026-10-15)

The S1b daily sandbox subscription was checked through `/ops` («Звірити з LiqPay») and then ended («Завершити зараз»): LiqPay confirmed `unsubscribed`. `status` still answered its first `subscribe` transaction a week later, so it does not report renewals; the reconcile job now reads LiqPay's payments archive instead (ADR 0018, «Owner-app checks of 2026-10-15»). Whether the sandbox charged it daily can be seen in the LiqPay sandbox cabinet (order `01a11bed-00a6-…`).

## Environment

| Variable | Service | Default | Meaning |
|---|---|---|---|
| `READ_ONLY_RETENTION_MONTHS` | worker | `12` | How long read-only content of an account is kept after its trial or plan ended |
| `BILLING_RETENTION_DELETE_ENABLED` | worker | `false` | Lets the retention clock delete due collections; warnings go out either way |
| `BILLING_PROVIDER` | api, worker | `disabled` | `liqpay` turns payments on; needs both keys |
| `LIQPAY_PUBLIC_KEY`, `LIQPAY_PRIVATE_KEY` | api, worker | — | The merchant's key pair (sandbox on staging and locally); secrets, `sync: false` |
| `LIQPAY_API_BASE` | api, worker | `https://www.liqpay.ua` | LiqPay's server API; tests point it at a local stub |
| `BILLING_CALLBACK_URL` | api | — | Our public callback URL (`server_url`); required in production |
| `BILLING_PENDING_TTL_MINUTES` | api, worker | `30` | How long a checkout stays payable (also LiqPay's `expired_date`) |
| `BILLING_FISCAL_MODE` | api, worker | `none` | `liqpay_rro` adds fiscal receipt lines (`rro_info`) to every checkout |
| `BILLING_FISCAL_WAIVED` | api, worker | `false` | Set deliberately after the accountant's answer to run live keys without receipts |
| `LIMIT_BILLING_CALLBACKS_PER_IP_PER_MINUTE` | api | `120` | The public callback route, per client IP |
| `LIMIT_BILLING_CHECKOUTS_PER_USER_PER_HOUR` | api | `20` | Checkouts per account |
| `BILLING_GRACE_DAYS` | api, worker | `4` | Days a plan keeps working after a missed renewal (or an unpaid monthly ↔ yearly switch) |
| `BILLING_MIN_CHARGE_MINOR` | api | `100` | An upgrade's prorated charge below this (kopecks) is waived |
