# Stepler Billing: Trial, Collection Packs, Subscriptions and LiqPay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new account gets a 7-day trial without a card (1 collection, 1 GB). After that it buys either a one-time **collection pack** for one event or an account-level **subscription** with auto-renewal, paying by card through LiqPay. When a trial, pack or subscription ends unpaid, the account or collection becomes **read-only**: guests cannot add anything, the gallery and downloads keep working, and the content is kept for a fixed time before it is deleted after e-mail warnings. The operator edits plans and prices in `/ops`, grants complimentary plans, and refunds payments.

**Architecture:**
- **Entitlements.** `LimitsService` stays the single resolver (ADR 0010) but becomes asynchronous and database-backed. `EntitlementResolver` combines the account source (trial, subscription or complimentary grant) and the collection source (a pack) into `EffectiveLimits` plus an `AccessState`. `EntitlementGate.assert(...)` is the one checkpoint every write path calls.
- **Catalogue.** `BillingOffer` + `BillingPrice` rows in PostgreSQL, edited in `/ops`. Prices are integer minor units with a currency. A purchase snapshots the price and limits; editing an offer never changes what was bought.
- **Payments.** A new `BillingModule` with a `PaymentProvider` port and a `LiqPayProvider` adapter (own SHA3-256 signing on `node:crypto`, no SDK). The browser receives only a signed checkout form. A public signature-verified callback writes `PaymentEvent` rows and applies transitions idempotently. The worker reconciles through LiqPay's `status` API and runs the renewal, grace, read-only and retention clocks.
- **Web.** A public `/pricing` page, «Тариф і оплата» at `/app/billing`, checkout return pages, per-collection pack status, trial/grace/read-only banners, a guest "збір завершено" state, and `/ops/billing/*` inside the existing console boundary.

**Tech Stack:** As in slices 1–10: NestJS 12 ESM, Prisma 7 on PostgreSQL 18, Zod 4 contracts, pg-boss, nodemailer behind the `Mailer` port, Next.js 16 App Router + next-intl, TanStack Query 5, React Hook Form + Zod, Tailwind 4 + shadcn/Radix in `@stepler/ui`, Storybook 10 + Vitest browser + axe, Playwright with Mailpit. **No new dependency** (`node:crypto` has `sha3-256`).

**Spec:**
- **Owner decisions B1–B12** (2026-10-07) and **B14** (2026-10-08), below.
- ADR 0018 (this plan's draft, `docs/architecture/decisions/0018-billing-and-entitlements.md`, Proposed); ADR 0010 (limits seam, partly superseded), 0009 (jobs), 0013 (operator), 0016 (legal acceptance).
- `docs/product/PRODUCT.md` §22–23; `docs/architecture/discovery-questions.md` D2, D13, F1 (l.140–153, 409–428, 479–505; the "no billing in MVP" lines are superseded by B1–B12).
- LiqPay docs (URLs in ADR 0018 "Sources"; read 2026-10-07).
- `docs/design/DESIGN-SYSTEM.md` §0 (V1 «Графіт»).
- Conventions: `2026-10-06-content-reports-and-operator.md`, `2026-10-06-appeals-and-quarantine.md`.

## Prerequisites

- `dev` at `5302f3a` or later (slices 9 and 9b merged). This plan lives on `feat/billing`; each PR branch is cut from the then-current `dev`.
- **Owner answers B1–B12 are final.** Open questions at the end carry a recommended default; the tasks follow the default, and a different answer changes only the steps tagged with that id (`[Q1]`…).
- **Spike S1 (Task 9) runs before any other M2 task.** M1 needs no LiqPay account.

## Owner decisions (2026-10-07, confirmed)

1. **[B1] Hybrid model.** One-time **collection packs** for private customers; account-level **subscriptions** for event businesses.
2. **[B2] Currency.** UAH only now. The model allows EUR/USD later: amounts in integer minor units with a currency column, prices per currency per offer, never a float.
3. **[B3] Merchant.** The owner has a ФОП/ТОВ but no LiqPay merchant yet. Build against the LiqPay **sandbox**. Owner action: register the merchant at PrivatBank/LiqPay and obtain keys for staging (sandbox) and production. The tax regime («ФОП 4 групи, КВЕД 63.11») and the fiscalisation (ПРРО) obligation must be confirmed by an accountant; that is a **production blocker** (see [Q1]).
4. **[B4] One-time pack = one collection.** It carries storage (GB), a collection window (guests upload for N days from activation) and a retention period (content kept N days).
   - Tiers (draft, editable in `/ops`): «Старт» 10 GB, «Подія» 50 GB; window 30 days; retention 1 year.
   - A pack is bought for a specific collection, or creates one.
   - Extensions are separate one-time purchases: «Продовжити збір на 30 днів», «Продовжити зберігання на рік», «Збільшити обсяг» (pay the difference to the bigger pack).
5. **[B5] Subscriptions** (account-level, for businesses): «Pro» 5 active collections / 200 GB, «Business» 20 / 1 TB (draft), monthly and yearly.
   - Auto-renewal through LiqPay recurring payments.
   - Cancel any time; access stays until the end of the paid period.
   - A failed renewal starts a grace period of a few days (configurable) with banners, then read-only.
6. **[B6] Plan changes.** Upgrade immediately with a one-time prorated charge for the rest of the period, then the new full price. Downgrade from the next period, and only if current usage fits the new limits; otherwise explain what to reduce.
7. **[B7] Trial.** No card; 7 days after sign-up; 1 collection, 1 GB; then read-only until the user buys a pack or subscribes.
8. **[B8] No Free plan.** When a trial, pack or subscription period ends unpaid: **read-only** — guests cannot upload, the guest gallery stays viewable (if the link allows), the admin can view and download. Content is **kept 12 more months**, then deleted after e-mail warnings to the admin (30 and 7 days before). Retention is described in the legal texts.
9. **[B9] Entitlements are limits only now:** active collections, storage per account, storage per collection, collection window, retention, guest links per collection. The model is ready for per-plan feature flags later (a `features` map, unused by the UI).
10. **[B10] Plans and prices live in the database and are edited in `/ops`** (no deploy to change a price). A purchase snapshots price and limits; editing an offer never changes what was bought. Offers are deactivated, never deleted.
11. **[B11] Refunds are manual from `/ops`** (full or partial) through the LiqPay API, audited; the rules are in the Terms. No self-service refunds.
12. **[B12] Card only** through LiqPay (no invoices, acts or bank transfer). Receipts follow the fiscalisation decision.
14. **[B14] Monthly ↔ yearly is scheduled, not paid up front** (owner, 2026-10-08; replaces Task 17's "paid now, starts at the period end"). Nothing is charged when the switch is chosen; «Тариф і оплата» shows the pending change («З <дата> — щорічно, 4 990 ₴») with «Скасувати зміну». At the period end the old LiqPay subscription is unsubscribed and the owner is asked — a banner on «Тариф і оплата» and one important mail (the renewal-failed pattern) — to confirm the new subscription through a LiqPay checkout. Until it is paid the normal grace period applies, then read-only as usual. Implementation: the reconcile job stops the old subscription within the last 24 h of the period (LiqPay's own charge can run minutes ahead of our period end); from then the change can no longer be withdrawn, and the new plan's checkout (`SUBSCRIPTION` with the pending price) may be paid at once — its first period still starts at the old period's end.

## Decisions made by this plan (recommendation first; override if you disagree)

1. **[P1] Two entitlement sources, resolved in one place.**
   - **Account source** (at most one at a time, in this priority): a live `Subscription` (`ACTIVE`, `PAST_DUE` in grace, or `CANCELED` before `currentPeriodEnd`) → a live complimentary grant (a `Subscription` with `source = COMPLIMENTARY`) → the trial (`User.trialEndsAt > now`) → none.
   - **Collection source:** `Collection.entitlement` is `ACCOUNT` (default) or `PACK`. A `PACK` collection has one `CollectionPack` row and is governed by it alone: it is **not** counted in the account's active collections or account storage, and the account's state does not make it read-only. An `ACCOUNT` collection takes the account source's per-collection limits and the account's state.
   - So a subscriber may also own pack collections, and a pack customer's trial-era collection can be turned into a pack collection by buying a pack for it.
   - `LimitsService.forUser(userId, tx?)` / `forCollection(collectionId, tx?)` become `async` and return the resolved shape (Task 3). Abuse limits (per IP, per session, file sizes, creations per day) stay in env.
2. **[P2] Access states and what each allows.**

   | State | Applies to | Guests | Admin |
   |---|---|---|---|
   | `ACTIVE` | account or collection | upload, texts, gallery | everything |
   | `GRACE` | account (failed renewal) | as `ACTIVE` | as `ACTIVE` + warning banner |
   | `COLLECTING_CLOSED` | pack collection after `windowEndsAt` | gallery only («Збір завершено») | everything except reopening guest contribution; «Продовжити збір» |
   | `READ_ONLY` | account (trial/subscription ended) or pack collection after `retentionEndsAt` | gallery only («Колекція доступна лише для перегляду») | view, download, archive, delete content/collection, revoke/deactivate/delete links, hide/unhide, appeals, billing; nothing that adds content, links, collections or edits the guest page |

   A collection's effective state is its pack's state if `PACK`, else the account's state.
3. **[P3] One write checkpoint: `EntitlementGate`.** `assertGuestCanContribute(collectionId, tx)` (guest uploads initiate, texts create) and `assertAdminCanWrite({ userId } | { collectionId }, tx)` (collection create, unarchive, `PATCH /collections/:id`, guest-link create/rotate/activate/update, guest-page draft/publish/from-frame/uploads, collection image from-frame/uploads). Upload **complete** and **cancel** stay allowed (an upload initiated before the cutoff may finish; its space was reserved). A test enumerates the Nest router and fails if a mutating admin or guest route is neither gated nor on the explicit allow-list (the slice 9 enumeration precedent).
4. **[P4] Pack clocks start at payment.** `activatedAt = paidAt`; `windowEndsAt = activatedAt + windowDays`; `retentionEndsAt = activatedAt + retentionDays`. Extensions: window `+30 d` from `max(now, windowEndsAt)`; retention `+365 d` from `max(now, retentionEndsAt)`; storage upgrade moves to the bigger tier at the price difference between the two tiers' **current** prices (floored at 0; [Q4]).
5. **[P5] After the paid time ends ([B8], [Q2]).**
   - **Account source ended** (trial or subscription): its `ACCOUNT` collections are `READ_ONLY`, with `deleteAfter = endedAt + READ_ONLY_RETENTION_MONTHS` (12).
   - **Pack collection:** after `windowEndsAt` it is `COLLECTING_CLOSED`; after `retentionEndsAt` it is `READ_ONLY` with `deleteAfter = retentionEndsAt` (default [Q2]: the bought retention, 1 year, already is the "kept after collecting" period; the alternative adds 12 more months).
   - Buying any entitlement that covers the collection clears `deleteAfter` and both warning stamps.
6. **[P6] Deletion is the existing collection purge.** The worker's daily `billing.retention` job sends the 30- and 7-day warnings (stamping `Collection.deletionWarnedAt30` / `deletionWarnedAt7`) and, when `deleteAfter < now`, moves the collection to `DELETING` with `collection.purge` exactly as `CollectionsService.delete` does (audit actor `SYSTEM`, action `collection.delete`, metadata `{reason: 'retention'}`). The deletion step is behind `BILLING_RETENTION_DELETE_ENABLED` (default `false`) until the legal texts with retention are published (Task 22).
7. **[P7] Callbacks plus polling; `result_url` is never trusted.** The return page reads our own `GET /billing/payments/:id`, which, while the payment is non-final and older than 30 s, asks LiqPay's `status` API once per 15 s per payment and applies the answer through the **same** transition function as the callback. So local development works with sandbox keys and no tunnel, and a lost callback heals on the next view or the reconciliation job. This is a real provider call, not a simulation (rule 18).
8. **[P8] Our `order_id` is our payment id** (`uuidv7`, 36 chars ≤ 255). It is unique in `Payment.providerOrderId`; a callback is matched by it and nothing else. A callback whose `amount`/`currency` differ from the payment's snapshot is stored, flagged `MISMATCH`, never grants anything, and appears in `/ops`.
9. **[P9] Recurring charges are separate `Payment` rows** of kind `SUBSCRIPTION_RENEWAL`, keyed by LiqPay's `payment_id` (unique). A renewal callback is matched on the subscription's `providerOrderId` (the `order_id` of the original `subscribe`, per LiqPay's docs); spike S1b (2026-10-08) verified the first charge (`subscribed` on that order) but could not observe a `regular` charge, so this stays on the staging checklist (ADR 0018).
10. **[P10] Proration** (upgrade, same billing period length): `charge = ceil((newPrice − oldPrice) × secondsLeft / periodSeconds)` in minor units, where the period is `[currentPeriodStart, currentPeriodEnd)`. A charge below `BILLING_MIN_CHARGE_MINOR` (100 = 1 грн) is waived and the upgrade applies at once. The new full price applies from the next renewal via `subscribe_update` (S1b: answers at once with `subscribed` and the new amount, charges nothing now). Monthly ↔ yearly switches take effect at the next period like a downgrade ([Q6]).
11. **[P11] Downgrades** are stored as `Subscription.pendingOfferId/pendingPriceId` and applied by the renewal transition; at request time and again at renewal the server checks usage against the target limits (`activeCollections`, account storage, per-collection storage, guest links); a refusal returns `409 PLAN_DOWNGRADE_BLOCKED` with `details.excess[]` (what to reduce, by how much). If usage grew beyond the target by renewal time, the downgrade is cancelled, the old plan renews, and the admin sees why.
12. **[P12] Grace = `BILLING_GRACE_DAYS` (default 4).** LiqPay retries a failed recurring charge 3 times within 72 hours (subscription docs); 4 days covers those retries plus a late callback. The subscription is `PAST_DUE` from `currentPeriodEnd` until a renewal succeeds or `graceEndsAt` passes, then `EXPIRED` (account `READ_ONLY`) and the worker calls `unsubscribe`.
13. **[P13] Complimentary grants for existing accounts ([Q3]).** On release, every existing account gets a fresh 7-day trial from the migration time, and the operator can grant a complimentary plan in `/ops` (any `SUBSCRIPTION` offer's limits, with an optional end date). The owner's own and test accounts get grants without an end date.
14. **[P14] Fiscalisation is a port** (`FiscalReceipts`: `none` | `liqpay_rro`, env `BILLING_FISCAL_MODE`, default `none`). `liqpay_rro` adds `rro_info {items:[{id, amount:1, price, cost}], delivery_emails:[account e-mail]}` with `BillingOffer.rroItemId` (the item id registered in the LiqPay cabinet). Production refuses to start with `BILLING_PROVIDER=liqpay`, live keys and `BILLING_FISCAL_MODE=none` unless `BILLING_FISCAL_WAIVED=true` is set deliberately after the accountant's answer ([Q1]).
15. **[P15] Legal texts go to v3** (draft, `requireReacceptance: true`), not edits of v2: staging accounts accepted v2, and payment, auto-renewal, refunds and retention are material changes. The existing ADR 0016 mechanism does the rest ([Q7]).

## Deliberate choices (low risk; override if you disagree)

- **Money:** `amountMinor` is `Int` (kopecks; `CHECK > 0`); `Currency` is an enum `UAH | EUR | USD` with only `UAH` priced now. LiqPay's decimal `amount` is produced by `formatMinor(amountMinor) → "123.45"` and parsed back from the callback with `parseAmountToMinor(value: number | string) → number` (string-split, not `* 100` on a float). A test covers `0.1 + 0.2`-style values.
- **Time:** every timestamp is `timestamptz(3)` UTC; month/year arithmetic is calendar-based in UTC with day clamping (`Jan 31 + 1 month = Feb 28/29`), in one pure module `billing/periods.ts`. The UI shows dates in `Europe/Kyiv`.
- **Trial:** `User.trialEndsAt` (nullable) is set to `createdAt + TRIAL.durationDays` on account creation (magic-link verify and Google callback both go through the same user upsert). Trial limits come from the live `TRIAL` offer row (not a purchase, so no snapshot). One trial per account, never renewed; a new account with the same e-mail is the same account (e-mail is unique).
- **Trial collection:** a collection created on the trial is an `ACCOUNT` collection; buying a pack for it converts it to `PACK` (limits reset to the pack's), buying a subscription keeps it `ACCOUNT`.
- **Buying a pack "that creates a collection":** checkout with `collectionId: null` and a `title`; on success the transition creates the collection (with its default link, through `CollectionsService.createInTx`) as `PACK`, and the return page links to it. No active-collection limit applies to pack collections.
- **One pending checkout per target.** Creating a checkout locks the target (`User` row for subscriptions, `Collection` row for packs/extensions) and returns the existing `PENDING` payment's form if one exists for the same offer/price and is younger than `BILLING_PENDING_TTL_MINUTES` (30; also sent as LiqPay `expired_date`). A different offer while one is pending → `409 PAYMENT_PENDING`.
- **A late success that would double-grant** (e.g. a second pack payment for a collection that became `PACK` meanwhile) is applied as an **extension of value 0**: the payment becomes `SUCCEEDED` with `needsReview = true`, nothing is granted twice, and `/ops` lists it for a refund.
- **`PaymentEvent` stores no card holder PII.** The callback `data` is decoded and only whitelisted fields are kept in `payload` jsonb (`action, status, order_id, liqpay_order_id, payment_id, amount, currency, err_code, err_description, create_date, end_date, paytype, is_3ds, refund_amount, version`). Names, phone, IP, card mask and `card_token` are dropped before the row is written. The raw string is hashed (`sha256`) for dedupe and then discarded. Rows are kept 3 years ([Q8]).
- **Logs:** `billing.callback` `{eventId, orderId, status, verified, outcome}`; never `data`, `signature`, keys, e-mails or amounts with names. A bad signature logs `{reason: 'signature', bytes}` only.
- **Rate limits:** the callback route has its own throttler bucket (`LIMIT_BILLING_CALLBACKS_PER_IP_PER_MINUTE`, 120); checkout creation `LIMIT_BILLING_CHECKOUTS_PER_USER_PER_HOUR` (20).
- **Callback route body:** `application/x-www-form-urlencoded` (`data`, `signature`), parsed by Nest's default Express urlencoded parser (verified in Task 11's test). `@Public()` + `@SkipOriginCheck()` (LiqPay posts cross-origin) + no legal gate. Body limit 64 KB. Always answers `200` once the event is stored (even for a non-matching order) so LiqPay does not retry a poison message; answers `400` only for a bad signature or a malformed body.
- **Mails (billing only, allowed by B8):** `mail.billing-renewal-failed` (grace started), `mail.billing-read-only` (account became read-only), `mail.billing-deletion-warning` (30 and 7 days). Payment receipts: LiqPay's own receipt / the fiscal receipt; Stepler sends none ([Q9]). Templates in uk/en by `User.locale`.
- **Audit actions:** `billing.checkout`, `billing.payment_succeeded`, `billing.payment_failed`, `billing.subscription_cancel`, `billing.subscription_change`, `billing.refund`, `billing.grant`, `billing.grant_revoke`, `billing.offer_create`, `billing.offer_update`, `billing.price_set`, `billing.offer_deactivate`; `targetType` gains `'payment' | 'subscription' | 'offer'`.
- **Operator scope for billing:** the operator sees all payments, subscriptions and offers (billing is not content; P5 of slice 9 limits content scope only). Billing screens show the account e-mail but no collection content.
- **Account deletion** does not exist as self-service (Terms v2: by e-mail). The operator's manual account closure gets one billing precondition: `/ops` «Скасувати підписку зараз» (immediate `unsubscribe`, no refund unless issued separately). A future `DELETE /me` must call `SubscriptionService.cancelImmediately` first (recorded in ADR 0018).
- **Error codes** appended to `ERROR_CODES` with uk/en messages (and `appeals.test.ts:56`'s "last three codes" assertion moved to the new tail): `ACCOUNT_READ_ONLY` (403), `COLLECTION_READ_ONLY` (403), `COLLECTING_CLOSED` (403), `OFFER_UNAVAILABLE` (409), `PAYMENT_PENDING` (409), `PLAN_DOWNGRADE_BLOCKED` (409), `SUBSCRIPTION_EXISTS` (409), `REFUND_EXCEEDS_PAID` (409), `PAYMENT_PROVIDER_UNAVAILABLE` (503), `BILLING_SIGNATURE_INVALID` (400).

## LiqPay: what the docs confirm (2026-10-07) and what the spike must settle

| Topic | Status | What the plan relies on |
|---|---|---|
| Checkout `pay` / `subscribe` | **verified** (checkout page) | POST form `data` + `signature` to `https://www.liqpay.ua/api/3/checkout`; `version: 7`; required `public_key, action, amount, currency, description, order_id` (≤ 255); optional `server_url`, `result_url` (≤ 510), `expired_date` (UTC `YYYY-MM-DD HH:mm:ss`), `language` (`uk`/`en`), `paytypes`, `rro_info` |
| Signature | **verified for v7 (spike S1, 2026-10-07)** | `base64(sha3-256(private_key + data + private_key))`; the docs' worked example reproduces only with SHA3-256. The sandbox checkout page and the server API (`status`) accept our SHA3-256 signatures, and a real sandbox callback verified with SHA3-256 (SHA-1 is never accepted) |
| Callback | **verified** | POST `data` + `signature` to `server_url` once a final status is reached; fields include `order_id, liqpay_order_id, payment_id, action (pay/subscribe/regular), status, amount, currency, err_code, end_date` |
| Statuses | **verified** | final: `success, failure, error, reversed, subscribed, unsubscribed`; confirmation-needed: `*_verify`, `wait_qr`, `wait_sender`; other: `processing, prepared, wait_accept, wait_secure, wait_card, wait_reserve, wait_compensation, …, try_again`. `sandbox` is **not** a documented status |
| Recurring | **verified** | `action: subscribe`, `subscribe: 1`, `subscribe_date_start`, `subscribe_periodicity` (`day/week/month/year`); LiqPay charges itself and retries a failed charge 3 times within 72 h; `unsubscribe {order_id}`; `subscribe_update {order_id, amount, currency, description}` |
| First subscription charge | **verified (S1b, 2026-10-08)** | charged at checkout, status `subscribed` (not `success`), `action: subscribe`, amount, `payment_id`; `status` on the order keeps answering it |
| Renewal callback identity | **unverified (S1b could not observe a daily charge)** | per the docs: `action: regular` on the subscription's `order_id`, a new `payment_id` per charge; staging checklist |
| `subscribe_update` effect | **verified (S1b)** | no charge now; the next charges use the new amount; `status` then reports it |
| Refund | **verified** | `action: refund {order_id, amount}` to `https://www.liqpay.ua/api/request`; full or partial; response `status` + `wait_amount` |
| Status API | **verified** | `action: status {order_id}` → the payment's fields and `status` |
| Sandbox | **partly** | test keys start with `sandbox_`; cards `4242424242424242` (success), `4000000000003063` (3DS), `4000000000000002` (fails, `limit`). **Verified (S1, 2026-10-07):** sandbox keys deliver `server_url` callbacks (`action: pay`, `status: success`, `amount` as a JSON number, `version: 7`); `4000000000003063` succeeded without a 3DS challenge; `4000000000000002` is refused by LiqPay's anti-fraud on its page with no callback, the order stays payable and `status` reports no failure; the card form asks for the holder's first and last name; the result page does not redirect by itself («Повернутися на сайт»). `sandbox=1` is not used |
| Callback retries / source IPs | **unverified** | not documented; the design does not depend on them (signature + reconciliation) |
| Fiscalisation `rro_info` | **verified** (param shape) | `items[{id, amount, price, cost}]`, `delivery_emails[]`; item ids pre-registered in the LiqPay cabinet (РРО → Каса → Товари). Whether Stepler must fiscalise is the accountant's call ([Q1]) |

## PR split

| PR | Branch | Tasks | Ships | MVP for launch? | Promote to `stage`? |
|---|---|---|---|---|---|
| M1 | `feat/billing-entitlements` | 1–8 | catalogue tables + seeded draft offers, trial, `LimitsService` async + resolver, `EntitlementGate` on every write path, read-only/collecting-closed states, complimentary grants (operator API + minimal `/ops` form), banners and the guest state, retention clock with warnings (deletion flag off), docs | **yes** | yes; every staging account gets a fresh trial; the owner grants comps (O3) |
| M2 | `feat/billing-liqpay-packs` | 9–14 | spike S1, LiqPay adapter, payments, callback, reconciliation, pack + extension checkout, `/pricing`, return pages, pack status UI | **yes** | yes, with sandbox keys (O2) |
| M3 | `feat/billing-subscriptions` | 15–19 | subscribe, renewals, grace → read-only, cancel, upgrade with proration, scheduled downgrade, «Тариф і оплата» | **yes** (B5) — or right after launch ([Q5]) | yes |
| M4 | `feat/billing-ops-legal` | 20–23 | `/ops` offers/prices editor, payments and subscriptions lists, refunds, fiscal adapter, Terms/Privacy v3, retention deletion switched on, full journeys | **yes** | yes; production after O5–O7 |

Each PR ends with its own "docs, batched minors, verification, PR" step and is merged with a merge commit. M1 is safe to ship alone: without payments, nobody can buy, so staging accounts live on trial or comps.

## Owner-only actions (agents never see or write secrets)

| Id | When | Action |
|---|---|---|
| O1 | before M2 Task 9 | Register at liqpay.ua (PrivatBank) for the ФОП/ТОВ; copy the **sandbox** key pair into your local `apps/api/.env` (`LIQPAY_PUBLIC_KEY`, `LIQPAY_PRIVATE_KEY`) yourself. Agents never read it. |
| O2 | before promoting M2 | Set the sandbox keys and `BILLING_CALLBACK_URL=https://<staging-api-host>/api/v1/billing/liqpay/callback` on `stepler-api-staging` **and** the worker in Render (`sync: false`). |
| O3 | after promoting M1 | Grant yourself and test accounts a complimentary «Business» in `/ops/billing/grants`. |
| O4 | after promoting M2 / M3 | Run the sandbox smoke checklist (Task 23) on staging, on a phone and a laptop. |
| O5 | before production | Accountant: tax regime (group 4 is normally the agricultural single tax — confirm the group for КВЕД 63.11) and whether ПРРО receipts are required; if yes, register the cash register and items in the LiqPay cabinet and give the item ids for `BillingOffer.rroItemId`. |
| O6 | before production | Activate the live merchant; set the live keys only on production services; never on staging. |
| O7 | before production | Lawyer: Terms/Privacy v3 placeholders (payment terms, refunds, auto-renewal, retention); final prices in `/ops`. |

## Pre-implementation gate (rule 19)

- **Similar code:** `LimitsService`/`UsageService` (`lockOwner`, `assertCanReserve`, `storageBytesByCollection`), `CollectionsService.create/unarchive/delete` (`collection.purge` in-transaction), `assertLinkUsable`, `TextsService` (`Idempotency-Key`), the slice 9 guest-route enumeration (`moderation-guest-paths.e2e.spec.ts:196`), `OperatorGuard` + `operator-actions.service.ts` (reason + audit), `MaintenanceSweepHandler`, `job-runner.ts` schedules, mail jobs with `*NotifiedAt` stamps, `SkipOriginCheck` (guest controller), `BlockedBanner` (`Alert`), `fetchUsage`/`usage-meter.ts`, the `/ops` boundary in `eslint.config.js`.
- **Data:** new `BillingOffer`, `BillingPrice`, `Payment`, `PaymentEvent`, `Subscription`, `CollectionPack`, `Refund`; enums `OfferKind`, `PackExtensionKind`, `BillingInterval`, `Currency`, `PaymentKind`, `PaymentStatus`, `SubscriptionStatus`, `SubscriptionSource`, `CollectionEntitlement`, `RefundStatus`; `User.trialEndsAt`; `Collection.entitlement`, `deleteAfter`, `deletionWarnedAt30`, `deletionWarnedAt7`. Backfill: `trialEndsAt = now() + 7 days` for existing users; all collections `ACCOUNT`.
- **API:** account `GET /billing/offers` (also public), `GET /billing/summary`, `POST /billing/checkouts`, `GET /billing/payments`, `GET /billing/payments/:id`, `POST /billing/subscription/cancel`, `POST /billing/subscription/resume`, `POST /billing/subscription/change`, `DELETE /billing/subscription/pending-change`; public `POST /billing/liqpay/callback`; operator `/operator/billing/*` (offers, prices, payments, subscriptions, refunds, grants). `GET /me/usage` and the collection DTO gain access state and pack info; the guest context gains `contribution: 'OPEN' | 'COLLECTING_CLOSED' | 'READ_ONLY'`.
- **Permissions:** admin billing routes act only on `principal.userId`'s own rows; pack checkouts require the collection's owner (`status <> 'DELETING'`), else `404`. Operator billing routes need `OperatorGuard`. The callback is public and trusts only the signature.
- **Third parties:** LiqPay (backend adapter; the browser posts a signed form to LiqPay's checkout page — the provider's architecture requires it, rule 4/02; documented in ADR 0018). No SDK.
- **Retry:** checkout creation idempotent per target ([deliberate]); callback idempotent by `PaymentEvent.dedupeKey` and by the payment state machine (a transition from a final state is a no-op); refunds idempotent by `Idempotency-Key`; worker jobs singleton by entity id and stamp-based.
- **Partial failure:** a callback's event row and its transition commit in one transaction; if the transition fails the event stays `processedAt = NULL` and the reconciliation job reprocesses it. A refund's provider call happens before the DB write is final: `Refund` is inserted `PENDING` first, then the provider call, then `SUCCEEDED/FAILED`; a crash leaves `PENDING`, which reconciliation resolves through `status`.
- **Deletion:** offers are deactivated, never deleted (`ON DELETE RESTRICT` from prices, payments, subscriptions, packs). Payments/refunds/events reference `userId` with `RESTRICT`; `CollectionPack` cascades with its collection; `Payment.collectionId` is `SET NULL` (history survives a purge).
- **Expiration:** pending checkout TTL 30 min (+ LiqPay `expired_date`); trial 7 days; pack window/retention; subscription period + grace; deletion after retention with warnings.
- **Mobile:** pricing and checkout return pages are mobile-first (owners pay on phones); LiqPay's checkout page is LiqPay's. «Тариф і оплата» and `/ops/billing` are responsive (ops desktop-first, usable at 360).
- **Tests:** contracts unit; pure unit for periods, proration, money and the resolver; API integration for every gate, the callback (signed fixtures, bad signature, replay, out-of-order, mismatch), checkout authorization, refunds, worker clocks; Storybook play + axe; Playwright journeys against the **real** `LiqPayProvider` with test keys, where only LiqPay's endpoints are replaced: `page.route('https://www.liqpay.ua/api/3/checkout')` serves a stub checkout page and a local stub server (`e2e/support/liqpay-stub.ts`, reached through `LIQPAY_API_BASE`) answers `status`/`refund`/`unsubscribe` and posts signed callbacks — no fake code path exists in the product (rule 18); a manual sandbox checklist.
- **Scope:** MVP for launch (B1–B12). Not here: invoices/acts, bank transfer, promo codes, VAT/multi-currency pricing UI, self-service refunds, feature flags in the UI, account self-deletion, Apple/Google Pay as separate integrations (LiqPay `paytypes` covers them).

## Global Constraints

- **Branches:** one per PR as in the PR split, cut from `dev`, PR to `dev`, merged with a merge commit, one commit per task. Never push to `dev`, `stage` or `main` directly (rule 15).
- **Pace over polish:** per-task review raises only correctness, security, data-integrity and accessibility blockers; minors are batched into each PR's last task.
- **Server authority (rules 4, 09):** amounts, currency, limits and the target are computed on the server from the offer/price ids; the client sends ids only. The browser never sees `LIQPAY_PRIVATE_KEY`. `result_url` parameters are ignored. Every state change comes from a verified callback or a server-side `status` call.
- **Secrets and logs:** `LIQPAY_PRIVATE_KEY` lives only in `env.ts`/`worker-env.ts` and the adapter; it is redacted by the logger's redact paths; never in a DTO, error, audit metadata, job payload or test snapshot. No `data`/`signature` strings in logs.
- **Money:** integer minor units end to end; `formatMinor`/`parseAmountToMinor` are the only conversions; no `Number` arithmetic on decimal amounts; proration uses integer math (`BigInt` for the product before dividing).
- **Authorization:** admin billing routes reach rows only through `userId = principal.userId` (and `collection.ownerId = principal.userId AND status <> 'DELETING'`), else `404`. Operator billing routes need `OperatorGuard`, else `404`. The callback is `@Public() @SkipOriginCheck()` and authenticated by the signature alone.
- **Contracts:** strict Zod objects, no `.transform()`, no `z.date()`; money is `{ amountMinor: z.int().positive(), currency: currencySchema }`; DTOs mapped explicitly, never from a Prisma row; new error codes appended to `ERROR_CODES` with uk/en messages.
- **Database:** migrations with `prisma migrate dev --create-only`, named raw-SQL CHECKs and partial indexes appended (ADR 0005); `pnpm db:check` passes; ids `uuidv7()`; lock order [C9]: `User` → `Collection` → `Subscription`/`Payment`, never reversed.
- **Env:** each new variable goes into `env.ts` / `worker-env.ts` with tests, `.env.example` (comment), `turbo.json` `passThroughEnv`, `e2e/playwright.config.ts`, `docker/scripts/verify-images.sh`, `render.yaml` (`sync: false` for keys and URLs) and the README env table. New: `BILLING_PROVIDER` (`liqpay`|`disabled`, default `disabled`), `LIQPAY_PUBLIC_KEY`, `LIQPAY_PRIVATE_KEY`, `LIQPAY_API_BASE` (default `https://www.liqpay.ua`), `BILLING_CALLBACK_URL`, `BILLING_GRACE_DAYS` (4), `BILLING_PENDING_TTL_MINUTES` (30), `BILLING_MIN_CHARGE_MINOR` (100), `READ_ONLY_RETENTION_MONTHS` (12), `BILLING_RETENTION_DELETE_ENABLED` (false), `BILLING_FISCAL_MODE` (`none`), `BILLING_FISCAL_WAIVED` (false), `LIMIT_BILLING_CALLBACKS_PER_IP_PER_MINUTE` (120), `LIMIT_BILLING_CHECKOUTS_PER_USER_PER_HOUR` (20). Removed from `env.ts` (values move to the TRIAL offer seed): `LIMIT_ACTIVE_COLLECTIONS_PER_ACCOUNT`, `LIMIT_STORAGE_BYTES_PER_ACCOUNT`, `LIMIT_STORAGE_BYTES_PER_COLLECTION`, `LIMIT_GUEST_LINKS_PER_COLLECTION` (kept accepted-and-ignored for one release with a startup warning, so Render configs do not break).
- **`BILLING_PROVIDER=disabled`** is honest, not fake: checkout answers `503 PAYMENT_PROVIDER_UNAVAILABLE`, the pricing page shows «Оплата тимчасово недоступна», nothing is granted (rule 18).
- **OpenAPI:** `@ApiTags('Billing')` (account + callback) and `@ApiTags('Operator')`; every route has `@ApiResponse` + documented error codes; `pnpm openapi:write` in the same commit as the API change.
- **Web:** TanStack Query for server state; no literal UI strings (uk default, en parity; `ukrainian-copy.test.ts` rules); amounts rendered with `Intl.NumberFormat(locale, {style:'currency', currency})` from minor units; dates in `Europe/Kyiv`; destructive and paying actions go through `ConfirmDialog`; touch targets ≥ 44 px; nothing hover-only; no horizontal scroll at 320/360/390.
- **Design pass (every UI task):** before the task apply the frontend-design, ui-ux-pro-max, web-design-guidelines and responsive-design skills and write the decisions as a 5–10 line header comment in the main file; after it, screenshots at 360×780, 390×844 and 1440×900, light and dark, into `$TMPDIR/stepler-billing-screens/<pr>/` (not committed) for the owner; report the owner's remarks as a numbered status table.
- **Never** start or stop the owner's dev servers (3000/4010), read or touch `apps/*/.env`, or run migrations against the owner's database. `pnpm e2e` uses 3100/4100 and `stepler_e2e`. CI minutes: desktop-only e2e on PRs to `dev`.

## Review Focus

1. **Double grant or double charge from a replayed, duplicated or reordered callback.**
   - **Inputs:** the same signed callback posted twice; the same status with a different `data` string (re-serialised); `success` after `failure`; `failure` after `success`; `reversed` after `success`; a callback for an unknown `order_id`; two concurrent `success` callbacks for one payment; a `success` for a pack whose collection became `PACK` meanwhile.
   - **Expected:** exactly one grant per payment; final states never regress except `SUCCEEDED → REVERSED` (ends the grant, [Q4]) and the refund states set by `/ops`; the unknown order is stored and answered `200`; the late duplicate pack is `needsReview` with nothing granted twice. Tests in Task 12.
2. **A write path that skips read-only.**
   - **Setup:** an account whose trial ended; a pack collection after `windowEndsAt`; a pack collection after `retentionEndsAt`; an account in grace.
   - **Expected:** every mutating admin and guest route is either gated (`403 ACCOUNT_READ_ONLY` / `COLLECTION_READ_ONLY` / `COLLECTING_CLOSED`) or on the explicit allow-list; the router-enumeration test fails if a new route is neither; grace allows everything. An upload initiated before the cutoff still completes. Tests in Task 4.
3. **Proration and money rounding.**
   - **Inputs:** upgrade 1 second after renewal, 1 second before `currentPeriodEnd`, on the 31st with a February period, from a yearly plan, with a price difference of 1 kopeck, with `currentPeriodEnd` already past (grace).
   - **Expected:** charge in `[0, newPrice − oldPrice]`, never negative, ceil to a kopeck, waived below 100; upgrade in grace → `409 PAYMENT_PENDING` (pay the renewal first, [Q6]); `parseAmountToMinor(7.34) = 734`; a `0.1 + 0.2` float input throws and counts as a mismatch, never as a grant. Tests in Tasks 2 and 17.
4. **Period and timezone boundaries.**
   - **Inputs:** trial created at 23:59 Kyiv; a pack activated on Jan 31; a window ending exactly now (`<` vs `≤`); a DST change; a renewal callback arriving after `graceEndsAt`.
   - **Expected:** comparisons are `now < endsAt` → active, everywhere through one helper `isBefore(now, end)`; month clamping per `periods.ts`; a renewal arriving after `EXPIRED` reactivates the subscription for a new period from the charge time (the money was taken) and clears `deleteAfter`. Tests in Tasks 2, 3 and 16.
5. **Losing subscription state on a missed callback.**
   - **Setup:** the renewal callback is never delivered; the `subscribe` callback is lost but the user returns; the worker is down for a day.
   - **Expected:** reconciliation via `status` (per subscription, at `currentPeriodEnd` + 1 h and hourly through grace) moves it to `ACTIVE` or `PAST_DUE`/`EXPIRED`; the return page's poll activates a lost `subscribe`; on restart, the worker's sweep catches up all due clocks idempotently; nothing becomes `EXPIRED` while a reconciliation call is failing (provider error → stay `PAST_DUE`, alert in logs). Tests in Tasks 13 and 16.

---

## PR M1 — Entitlements, trial, read-only and complimentary grants (no payments)

### Task 1: Billing contracts

**Files:**
- Create: `packages/contracts/src/billing.ts`, `packages/contracts/src/billing.test.ts`, `packages/contracts/src/operator-billing.ts`, `packages/contracts/src/operator-billing.test.ts`
- Modify: `packages/contracts/src/index.ts`, `errors.ts` (+ the 10 codes in Deliberate choices), `appeals.test.ts:56` (the "last codes" assertion), `usage.ts`, `collections.ts` (collection DTO), `guest.ts` (guest context), `apps/web/messages/{uk,en}.json` (`errors.*`)

**Interfaces — produces:**
```text
currencySchema = z.enum(['UAH','EUR','USD']);  moneySchema = { amountMinor: int > 0, currency }
accessStateSchema = z.enum(['ACTIVE','GRACE','COLLECTING_CLOSED','READ_ONLY'])
accessReasonSchema = z.enum(['TRIAL','TRIAL_ENDED','SUBSCRIPTION','SUBSCRIPTION_PAST_DUE','SUBSCRIPTION_ENDED',
                             'COMPLIMENTARY','PACK','PACK_WINDOW_ENDED','PACK_RETENTION_ENDED','NONE'])
entitlementLimitsSchema = { activeCollections: int|null, storageBytes: string(bigint)|null,
  collectionStorageBytes: string, guestLinks: int, windowDays: int|null, retentionDays: int|null }
offerDtoSchema = { id, code, kind: 'TRIAL'|'PACK'|'PACK_EXTENSION'|'SUBSCRIPTION', extension: 'WINDOW'|'RETENTION'|'STORAGE'|null,
  title, description, limits, rank: int, prices: [{ id, interval: 'ONE_TIME'|'MONTH'|'YEAR', ...money }] }
billingSummarySchema = { access: { state, reason, endsAt: iso|null, graceEndsAt: iso|null },
  trial: { endsAt } | null, subscription: SubscriptionDto | null, usage: UsageResponse }
checkoutRequestSchema = discriminatedUnion('kind', [
  { kind:'PACK', priceId, collectionId: uuid|null, title?: 1..120 (required iff collectionId null) },
  { kind:'PACK_EXTENSION', priceId, collectionId },
  { kind:'SUBSCRIPTION', priceId, autoRenewConsent: z.literal(true), termsVersion },
  { kind:'SUBSCRIPTION_CHANGE', priceId } ])
checkoutResponseSchema = { paymentId, status: 'PENDING'|'SUCCEEDED',   // SUCCEEDED when nothing to pay (waived)
  form: { action: z.url(), fields: { data: string, signature: string } } | null }
paymentDtoSchema = { id, kind, status, ...money, createdAt, paidAt|null, offerTitle, collectionId|null, refundedMinor }
usageResponseSchema += { access: {state, reason, endsAt} }
collection DTO += { entitlement: 'ACCOUNT'|'PACK', access: {state, reason, endsAt},
  pack: { offerTitle, storageBytes, windowEndsAt, retentionEndsAt } | null, deleteAfter: iso|null }
guest context += { contribution: 'OPEN'|'COLLECTING_CLOSED'|'READ_ONLY' }
operator-billing: offerUpsertSchema, priceSetSchema, grantCreateSchema { userId, offerId, endsAt: iso|null, reason 1..500 },
  refundCreateSchema { amountMinor: int>0, reason 1..500 }, paymentListQuery (cursor, status?, email?), …
```

- [ ] **Step 1: Write the failing tests** (`billing.test.ts`, `operator-billing.test.ts`):
  - `checkoutRequestSchema` rejects `amountMinor`, `currency` or any limit field in the body (strict);
  - `PACK` with `collectionId: null` and no `title` → invalid; with both → invalid;
  - `SUBSCRIPTION` with `autoRenewConsent: false` → invalid;
  - `moneySchema` rejects `0`, `-1`, `1.5`;
  - `refundCreateSchema` rejects `amountMinor: 0`;
  - the 10 new codes are the last entries of `ERROR_CODES`, and every code has uk/en messages.
- [ ] **Step 2: Run** `pnpm --filter @stepler/contracts test` → FAIL.
- [ ] **Step 3: Implement** the schemas above.
- [ ] **Step 4: Run** → PASS; `pnpm --filter @stepler/web test -- error-message`.
- [ ] **Step 5: Commit** `feat(contracts): billing, entitlements and access states`.

### Task 2: Pure billing domain: money, periods, proration, access resolution

**Files:**
- Create: `apps/api/src/billing/domain/money.ts`, `periods.ts`, `proration.ts`, `access.ts` and a `*.spec.ts` next to each

**Interfaces — produces:**
- `formatMinor(amountMinor: number): string` (`734 → "7.34"`, `100 → "1.00"`); `parseAmountToMinor(value: number | string): number` (throws on > 2 decimals or ≤ 0).
- `addInterval(start: Date, interval: 'MONTH' | 'YEAR', count = 1): Date` (UTC, day-clamped); `addDays(d, n)`; `isActiveAt(now: Date, end: Date | null): boolean` (`end === null || now < end`).
- `prorate({ oldPriceMinor, newPriceMinor, periodStart, periodEnd, now, minChargeMinor }): { chargeMinor: number; waived: boolean }`.
- `resolveAccess(input: AccessInput, now: Date): AccessResult` where
  `AccessInput = { trialEndsAt: Date|null; account: AccountSource|null; collection?: { entitlement: 'ACCOUNT'|'PACK'; pack: PackSource|null } }`,
  `AccountSource = { kind: 'SUBSCRIPTION'|'COMPLIMENTARY'; status; currentPeriodEnd: Date|null; graceEndsAt: Date|null; limits }`,
  `AccessResult = { state: AccessState; reason: AccessReason; endsAt: Date|null; graceEndsAt: Date|null; endedAt: Date|null; limits: EntitlementLimits }`.

- [ ] **Step 1: Write the failing tests:**
  - money: `formatMinor(5) = "0.05"`; `parseAmountToMinor(7.34) = 734`; `parseAmountToMinor("7.3") = 730`; `parseAmountToMinor(0.1 + 0.2)` (`0.30000000000000004`) throws (more than 2 decimals), which the callback treats as an amount mismatch;
  - periods: `addInterval(2027-01-31T10:00Z, 'MONTH') = 2027-02-28T10:00Z`; `2028-01-31 → 2028-02-29`; `addInterval(2028-02-29,'YEAR') = 2029-02-28`; `isActiveAt(end, end) = false`;
  - proration: old 50000, new 120000, 30-day period, 15 days left → `35000`; 1 s left → `1` → waived (`< 100`); now ≥ end → `{0, waived:true}`; new ≤ old → throws; `ceil` (1 kopeck remainder rounds up);
  - access: trial alive → `ACTIVE/TRIAL`, trial limits; trial ended, no source → `READ_ONLY/TRIAL_ENDED`, `endedAt = trialEndsAt`; subscription `ACTIVE` → `ACTIVE/SUBSCRIPTION` even if the trial is alive (subscription wins); `PAST_DUE` before `graceEndsAt` → `GRACE`; after → `READ_ONLY/SUBSCRIPTION_ENDED`, `endedAt = currentPeriodEnd`; `CANCELED` before `currentPeriodEnd` → `ACTIVE`; complimentary without end → `ACTIVE/COMPLIMENTARY`; pack collection before window → `ACTIVE/PACK` regardless of account `READ_ONLY`; between window and retention → `COLLECTING_CLOSED`; after retention → `READ_ONLY/PACK_RETENTION_ENDED`.
- [ ] **Step 2: Run** `pnpm --filter @stepler/api test -- billing/domain` → FAIL.
- [ ] **Step 3: Implement.** `prorate` multiplies in `BigInt` (`diff × secondsLeft`) and divides with ceil; no `Date` math outside `periods.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): billing domain: money, periods, proration and access resolution`.

### Task 3: Data model, seed offers, trial on sign-up, `LimitsService` on entitlements

**Files:**
- Modify: `apps/api/prisma/schema.prisma`, `apps/api/src/limits/limits.service.ts`, `limits.service.spec.ts`, `usage.service.ts`, every `forUser`/`forCollection` caller (`collections.service.ts`, `guest-links.service.ts`, `uploads.service.ts`, `image-uploads.service.ts`, `collection-images.service.ts`, `users/me.controller.ts`), the user upsert in `auth/` (magic-link verify + Google callback), `config/env.ts` (+ test), `.env.example`, `render.yaml`
- Create: `apps/api/prisma/migrations/<ts>_billing_entitlements/migration.sql`, `apps/api/src/billing/entitlement-resolver.ts`, `apps/api/src/billing/billing.module.ts`, `apps/api/test/migration-billing.e2e.spec.ts`, `apps/api/test/entitlements.e2e.spec.ts`

**Interfaces — produces (schema):**
```text
enum OfferKind { TRIAL PACK PACK_EXTENSION SUBSCRIPTION }   enum PackExtensionKind { WINDOW RETENTION STORAGE }
enum BillingInterval { ONE_TIME MONTH YEAR }               enum Currency { UAH EUR USD }
enum SubscriptionStatus { PENDING ACTIVE PAST_DUE CANCELED EXPIRED }   enum SubscriptionSource { LIQPAY COMPLIMENTARY }
enum CollectionEntitlement { ACCOUNT PACK }

BillingOffer  id, code text UNIQUE, kind, extension PackExtensionKind?, rank int, titleUk, titleEn, descriptionUk?, descriptionEn?,
              activeCollections int?, storageBytes bigint?, collectionStorageBytes bigint?, guestLinks int?,
              windowDays int?, retentionDays int?, durationDays int?  (TRIAL only), features jsonb default '{}',
              rroItemId text?, active bool default true, createdAt, updatedAt
BillingPrice  id, offerId → BillingOffer RESTRICT, interval, currency, amountMinor int, active bool, createdAt
              UNIQUE (offerId, interval, currency) WHERE active          -- one live price per slot
Subscription  id, userId → User RESTRICT, source, status, offerId → RESTRICT, priceId? → RESTRICT,
              interval?, amountMinor?, currency?, snapshot limits: activeCollections, storageBytes, collectionStorageBytes,
              guestLinks, features jsonb, currentPeriodStart?, currentPeriodEnd?, graceEndsAt?, cancelAtPeriodEnd bool,
              canceledAt?, endedAt?, pendingOfferId?, pendingPriceId?, providerOrderId text? UNIQUE,
              autoRenewConsentAt?, consentTermsVersion?, grantReason?, grantedByUserId?, createdAt, updatedAt
              UNIQUE (userId) WHERE status IN ('PENDING','ACTIVE','PAST_DUE') OR (status='CANCELED' AND "endedAt" IS NULL)
CollectionPack id, collectionId UNIQUE → Collection CASCADE, offerId → RESTRICT, storageBytes bigint, guestLinks int,
              activatedAt, windowEndsAt, retentionEndsAt, createdAt, updatedAt
User       += trialEndsAt timestamptz(3)?
Collection += entitlement CollectionEntitlement default ACCOUNT, deleteAfter?, deletionWarnedAt30?, deletionWarnedAt7?
```
CHECKs (named): `BillingPrice_amount_positive`; `BillingOffer_kind_shape` (TRIAL ⇒ `durationDays`, `activeCollections`, `storageBytes`; PACK ⇒ `collectionStorageBytes`, `windowDays`, `retentionDays`, no `activeCollections`; PACK_EXTENSION ⇔ `extension` set; SUBSCRIPTION ⇒ `activeCollections`, `storageBytes`); `Subscription_liqpay_shape` (LIQPAY ⇒ price, interval, amount, currency, `autoRenewConsentAt`); `Subscription_period_order` (`currentPeriodStart < currentPeriodEnd`); `CollectionPack_clock_order` (`activatedAt ≤ windowEndsAt ≤ retentionEndsAt`); `Collection_deletion_warnings` (warn stamps ⇒ `deleteAfter`).
Index: `Collection_delete_after_idx (deleteAfter) WHERE deleteAfter IS NOT NULL`; `Subscription_period_end_idx (status, currentPeriodEnd)`.
Seed (in the migration, `ON CONFLICT (code) DO NOTHING`): `trial` (7 d, 1 collection, 1 GiB account, 1 GiB per collection, 10 links); `pack-start` (10 GiB, 30 d, 365 d, 10 links, rank 1); `pack-event` (50 GiB, rank 2); `ext-window-30` (30 d); `ext-retention-365`; `ext-storage` (no own price; computed); `sub-pro` (5, 200 GiB, per collection 200 GiB, 20 links); `sub-business` (20, 1 TiB, per collection 1 TiB, 50 links). Prices: **`[PRICE]` placeholders** — seeded inactive offers have no prices; the operator sets them in `/ops` (Task 20) or by the M1 SQL snippet in `docs/deployment/billing.md` for staging. Backfill: `UPDATE "User" SET "trialEndsAt" = now() + interval '7 days'`.

**Interfaces — produces (code):**
- `EntitlementResolver.forAccount(userId, tx?): Promise<AccessResult>` and `forCollection(collectionId, tx?): Promise<AccessResult & { collection: { id, ownerId, entitlement } }>` — load rows, call `resolveAccess`.
- `LimitsService.forUser(userId: string, tx?): Promise<UserLimits & { access: AccessResult }>`; `forCollection(collectionId: string, tx?): Promise<CollectionLimits & { access: AccessResult }>`. `UserLimits.activeCollections`/`storageBytes` become `number | null`/`bigint | null` (null = no account source → only pack collections).
- `UsageService.activeCollections` and `accountStorageBytes` count `entitlement = 'ACCOUNT'` collections only; `assertCanReserve` checks the account limit only for `ACCOUNT` collections and the pack's `storageBytes` for `PACK` ones.

- [ ] **Step 1: Write the failing tests:**
  - `migration-billing.e2e.spec.ts`: each named CHECK rejects a bad row (one case each); two active prices for one `(offer, interval, currency)` violate the partial unique; two live subscriptions for one user violate it, an `EXPIRED` + an `ACTIVE` are allowed; deleting a collection deletes its `CollectionPack`; deleting an offer with a price → FK error; the seed rows exist and an existing user has `trialEndsAt ≈ now + 7 d`;
  - `entitlements.e2e.spec.ts`: a new user (magic link) has `trialEndsAt = createdAt + 7 d`; on trial `POST /collections` twice → second `409 COLLECTION_LIMIT_REACHED`; an upload over 1 GiB → `409 QUOTA_EXCEEDED`; a pack collection (seeded by SQL) accepts 5 GiB of reservations while the account is on trial and does not count toward the trial's 1 collection; `GET /me/usage` returns `access.state = 'ACTIVE'`, `reason = 'TRIAL'`;
  - `limits.service.spec.ts`: env-only methods unchanged.
- [ ] **Step 2: Run** `pnpm --filter @stepler/api test -- migration-billing entitlements limits` → FAIL.
- [ ] **Step 3: Write the schema; `prisma migrate dev --create-only --name billing_entitlements`;** append the SQL; apply to the test database only. Make `forUser`/`forCollection` async; fix every caller the compiler lists (each already runs inside a transaction holding the owner lock — pass `tx`). Set `trialEndsAt` in the shared user upsert (create branch only).
- [ ] **Step 4: Run** → PASS; `pnpm --filter @stepler/api test -- quotas collections uploads guest-links images` (no regressions); `pnpm db:check`.
- [ ] **Step 5: Commit** `feat(api): billing catalogue, trial and entitlement-backed limits`.

### Task 4: `EntitlementGate` on every write path

**Files:**
- Create: `apps/api/src/billing/entitlement-gate.ts`, `apps/api/test/entitlement-gate.e2e.spec.ts`
- Modify: `collections.service.ts` (`create`, `unarchive`, `update`), `guest-links.service.ts` (`create`, `rotate`, `activate`, `update`), `guest-page.service.ts` (draft put/publish/from-frame/restore), `image-uploads.service.ts` (`initiate`), `collection-images.service.ts` (from-frame), `uploads.service.ts` (`initiate`), `content/texts.service.ts` (`create`), `guest-sessions.service.ts` (context `contribution`)

**Interfaces — produces:**
- `EntitlementGate.assertAdminCanWrite(scope: { userId: string } | { collectionId: string }, tx): Promise<void>` → `403 ACCOUNT_READ_ONLY` (account scope) / `403 COLLECTION_READ_ONLY`.
- `EntitlementGate.assertGuestCanContribute(collectionId, tx): Promise<void>` → `403 COLLECTING_CLOSED` / `403 COLLECTION_READ_ONLY`.
- `GATE_ALLOW_LIST: readonly string[]` — `"METHOD /path"` of every mutating route intentionally ungated (archive, delete, content delete/bulk-delete/hide/unhide/dismiss, link deactivate/revoke/delete, draft `DELETE`, upload `complete`/`cancel`/`parts`, appeals, `/me*`, `/auth/*`, `/billing/*`, `/operator/*`, guest session create/patch, guest content delete, guest reports, guest resolve/theme).

- [ ] **Step 1: Write the failing tests** (`entitlement-gate.e2e.spec.ts`):
  - **Enumeration:** list every non-GET route from the Nest router (the `moderation-guest-paths` helper); assert each is either in `GATE_ALLOW_LIST` or covered by a gated case below (a table `GATED_CASES` keyed by `"METHOD /path"`); a route in neither fails the test with its name.
  - **Trial ended** (`trialEndsAt` in the past, no subscription): every `GATED_CASES` admin route → `403 ACCOUNT_READ_ONLY` / `COLLECTION_READ_ONLY` and no row changed; `archive`, `DELETE /content/:id`, `revoke` → 2xx; guest `POST uploads` and `POST texts` → `403 COLLECTION_READ_ONLY`; guest `GET content` → `200`; guest context `contribution = 'READ_ONLY'`.
  - **Pack window ended:** guest uploads/texts → `403 COLLECTING_CLOSED`; admin `PATCH /collections/:id` → `200`; `POST guest-links` → `200`.
  - **Pack retention ended:** as trial ended, for that collection only; another `ACCOUNT` collection of an active subscriber is unaffected.
  - **Grace:** everything allowed.
  - **In-flight upload:** initiate while active, end the trial (SQL), complete → `200` and the item exists.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the gate (one `EntitlementResolver` call; inside the caller's transaction after the owner lock) and call it first in each gated service method.
- [ ] **Step 4: Run** → PASS; the full API suite.
- [ ] **Step 5: Commit** `feat(api): read-only and collecting-closed enforced on every write path`.

### Task 5: Complimentary grants (operator API and a minimal `/ops` page)

**Files:**
- Create: `apps/api/src/operator/operator-billing.controller.ts`, `apps/api/src/billing/grants.service.ts`, `apps/api/test/operator-billing-grants.e2e.spec.ts`, `apps/web/src/app/ops/billing/grants/page.tsx`, `apps/web/src/ops/billing/grant-form.tsx`, `apps/web/src/ops/api/billing.ts`
- Modify: `operator.module.ts` (imports `BillingModule` exports only), `audit.service.ts` (actions, `targetType`), `apps/web/src/ops/ops-nav.tsx`, `apps/web/messages/{uk,en}.json` (`ops.billing.*`)

**Interfaces — produces:**
- `GrantsService.grant({ operatorId, userId, offerId, endsAt: Date | null, reason }): Promise<SubscriptionDto>` — refuses `409 SUBSCRIPTION_EXISTS` when a live LiqPay subscription exists; replaces an existing live grant (old one `EXPIRED`, `endedAt = now`); snapshot of the offer's limits; `currentPeriodStart = now`, `currentPeriodEnd = endsAt` (null = open-ended), which is what `resolveAccess` reads as the grant's end; audit `billing.grant`.
- `GrantsService.revoke({ operatorId, subscriptionId, reason })` → `EXPIRED`, audit `billing.grant_revoke`.
- Routes: `GET /operator/billing/accounts?email=` (exact e-mail lookup → `{userId, email, access, subscription}`), `POST /operator/billing/grants`, `POST /operator/billing/grants/:id/revoke`.

- [ ] **Step 1: Write the failing tests:** an operator grants «Business» with no end to a trial-ended user → that user's `GET /me/usage` shows `ACTIVE/COMPLIMENTARY` and 20 collections; grant with `endsAt` in the past → `400`; revoke → `READ_ONLY/TRIAL_ENDED` again; a non-operator and an unverified operator e-mail → `404`; an audit row with `reason`; an offer of kind `PACK` → `400 VALIDATION_FAILED`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** API and the page (e-mail search → account card → offer select, optional end date, reason dialog; inside the ops boundary). **Step 4: Run** → PASS; `pnpm --filter @stepler/web lint` (boundary) and the page's Storybook-free component test.
- [ ] **Step 5: Commit** `feat(ops): complimentary plan grants`.

### Task 6: Retention clock, deletion warnings and billing mails

**Files:**
- Create: `apps/api/src/worker/handlers/billing-retention.handler.ts` (+ spec), `apps/api/src/mail/templates/billing-deletion-warning.ts`, `billing-read-only.ts`, `apps/api/test/billing-retention.e2e.spec.ts`
- Modify: `schema.prisma` + migration `<ts>_billing_retention` (`User.readOnlyNotifiedAt`), `apps/api/src/jobs/job-names.ts` (`billing.retention` PERIODIC; `mail.billing-deletion-warning`, `mail.billing-read-only` MAIL), `worker/job-runner.ts` (schedule `billing.retention` at `17 3 * * *` UTC), `worker-env.ts` (`READ_ONLY_RETENTION_MONTHS`, `BILLING_RETENTION_DELETE_ENABLED`, `BILLING_GRACE_DAYS`), `collections.service.ts` (extract `markDeleting(tx, collectionId, actor)` from `delete`)

**Interfaces — produces:**
- `BillingRetentionHandler.run(now: Date): Promise<{ scheduled: number; cleared: number; warned30: number; warned7: number; deleted: number }>`:
  1. for every non-`DELETING` collection whose resolved state is `READ_ONLY` and `deleteAfter IS NULL` → set `deleteAfter` per [P5]; enqueue `mail.billing-read-only {userId}` once per account per read-only episode (stamp `User.readOnlyNotifiedAt`, cleared when access returns — add the column here);
  2. for collections with `deleteAfter` whose state is no longer `READ_ONLY` → clear `deleteAfter` and both stamps;
  3. `deleteAfter − 30 d ≤ now` and no `deletionWarnedAt30` → enqueue `mail.billing-deletion-warning {collectionId, days: 30}` and stamp; same for 7;
  4. `deleteAfter ≤ now` and `deletionWarnedAt7` set and `BILLING_RETENTION_DELETE_ENABLED` → `markDeleting` (actor `SYSTEM`, metadata `{reason:'retention'}`); never delete a collection whose 7-day warning was stamped less than 7 days ago (a late start never shortens the notice).
- Batched (500 per run per step), idempotent; safe to run twice.

- [ ] **Step 1: Write the failing tests:** with a fixed `now`, a trial-ended account's collection gets `deleteAfter = trialEndsAt + 12 months`; a pack past retention gets `deleteAfter = retentionEndsAt`; a grant clears it; warnings at 30 and 7 days are enqueued exactly once across two runs; with the flag off nothing is deleted; with it on, a collection with `deleteAfter` in the past but the 7-day warning only 2 days old is **not** deleted; one that qualifies becomes `DELETING` with a `collection.purge` job; Mailpit receives the uk warning with the collection title, date (Kyiv) and a link to `/app/billing`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `pnpm --filter @stepler/api test -- worker jobs`.
- [ ] **Step 5: Commit** `feat(worker): billing retention clock with deletion warnings`.

### Task 7: Read-only, trial and collecting-closed in the web app

**Files:**
- Create: `apps/web/src/app/app/access-banner.tsx` (+ story in `@stepler/ui` only if a new primitive is needed — reuse `Alert`), `apps/web/src/app/app/collections/[id]/pack-status.tsx`, `apps/web/src/guest/contribution-closed.tsx` (rendered by `apps/web/src/app/g/[token]/page.tsx`; check the guest component folder name before creating)
- Modify: the app layout (banner slot), `collections-dashboard.tsx` (usage line shows trial days left / read-only), the collection page (banner + disabled write actions with the reason), the guest page (upload/text entry replaced by the closed state; gallery unchanged), `apps/web/src/api/collections.ts`, `messages/{uk,en}.json` (`billing.access.*`, `guest.contribution.*`)

**Interfaces — consumes:** `usageResponseSchema.access`, collection DTO `access`/`pack`/`deleteAfter`, guest context `contribution`.

- [ ] **Step 0: Design pass** (Global Constraints).
- [ ] **Step 1: Write the failing tests** (component tests): the banner renders «Пробний період: залишилось 3 дні» for `ACTIVE/TRIAL` with `endsAt` in 3 days; «Пробний період завершився — колекції доступні лише для перегляду» + «Обрати тариф» for `READ_ONLY/TRIAL_ENDED`; for `GRACE`: «Не вдалося списати оплату — оновіть картку до {date}»; collection page buttons «Створити посилання», «Редагувати сторінку гостя» are `disabled` with `aria-describedby` pointing at the reason in `READ_ONLY`; the guest page in `COLLECTING_CLOSED` shows «Збір завершено» and still renders the gallery; with `deleteAfter` the collection page shows «Буде видалено {date}».
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Copy is final text in `messages` (uk; en parity). «Обрати тариф» links to `/app/billing` (a placeholder page in M1 that lists the trial and a «Оплата з'явиться незабаром» line until M2 — honest, no fake buttons).
- [ ] **Step 4: Run** → PASS; `pnpm --filter @stepler/web test typecheck lint`; screenshots.
- [ ] **Step 5: Commit** `feat(web): trial, read-only and collecting-closed states`.

### Task 8: Docs, env wiring, batched minors, verification, PR M1

- [ ] ADR 0010: status line "Partly superseded by ADR 0018 (plan/entitlement tables)"; ADR 0018 stays Proposed until the owner accepts it with this PR.
- [ ] `docs/deployment/billing.md`: how to grant comps, the staging price SQL snippet (with `[PRICE]` placeholders), the retention flag, the env table; README env table; `.env.example`; `render.yaml`; `turbo.json`; `verify-images.sh`.
- [ ] `docs/architecture/mvp-architecture-spec.md`: §13 limits now from entitlements; new §"Billing" summary pointing at ADR 0018.
- [ ] Batched minors from Tasks 1–7.
- [ ] Verification: `pnpm typecheck lint test build`, `pnpm --filter @stepler/api test`, `pnpm e2e` (desktop), `pnpm db:check`; record results honestly in the PR body.
- [ ] Open PR M1 to `dev` (do not merge without the owner).

---

## PR M2 — LiqPay adapter and one-time packs

### Task 9: Spike S1 — LiqPay sandbox behaviour (needs O1)

**Files:**
- Create: `apps/api/scripts/liqpay-spike.ts` (not imported by the app; deleted or kept as a documented dev tool at the end — owner's choice, default: deleted), findings in ADR 0018 "Unverified" → "Verified by spike (date)"

The owner runs the script locally with their sandbox keys in their shell environment (agents never read them) and a temporary public callback receiver of the owner's choice (e.g. `cloudflared tunnel` to a local port, or staging after M2 Task 11 is deployed behind the `disabled` flag). The script only builds signed forms and calls `status` / `unsubscribe` / `subscribe_update`; it never grants anything.

- [x] **Step 1:** Pay once with `4242424242424242` (`action: pay`, `version: 7`) → done through the owner's local app (`pnpm dev:tunnel`, sandbox keys only in the owner's `.env`): the callback arrived, `status: success`, verified with SHA3-256 (SHA-1 never accepted), and granted the pack.
- [x] **Step 2:** Pay with `4000000000000002` → LiqPay's page: «Платіж відхилено системою AntiFraud» with «Спробувати ще раз»; **no callback**; `status` reported no failure for the order (it stayed pending and our reconcile job expired it after its time). The return page handles this with «Оплату ще не підтверджено» after 20 s and «Спробувати ще раз» for the same order (`POST /billing/payments/:id/checkout`).
- [x] **Step 3 → [S1b], Task 15:** `action: subscribe` → the first charge reported as `subscribed` (2026-10-08); the `regular` charge was not observed (see ADR 0018 "Still unverified").
- [x] **Step 4 → [S1b], Task 17:** `subscribe_update` with a new amount → `subscribed`, new amount, no charge.
- [x] **Step 5 (partly):** `status` verified for paid, declined and unknown orders (the app's own reconciliation). `refund` → M4 (Task 21), observed there.
- [x] **Step 6:** findings in ADR 0018 ("Verified by spike S1"); `[S1]` tags resolved or moved to `[S1b]` (subscriptions). The spike ran through the product's own adapter and the owner's local app, so no `liqpay-spike.ts` script was written (plan deviation: nothing to delete).

### Task 10: `PaymentProvider` port and the LiqPay adapter

**Files:**
- Create: `apps/api/src/billing/provider/payment-provider.ts` (port), `apps/api/src/billing/liqpay/liqpay-signature.ts`, `liqpay.provider.ts`, `liqpay-status.ts` (status mapping), `apps/api/src/billing/fiscal/fiscal-receipts.ts` (`NoFiscalReceipts`, `LiqPayRroReceipts`), specs next to each, `apps/api/test/fixtures/liqpay/*.json` (decoded callback bodies; signed at test time with a test key)
- Modify: `config/env.ts` + `worker-env.ts` (+ tests; `LIQPAY_*`, `BILLING_*`; `LIQPAY_PRIVATE_KEY` required iff `BILLING_PROVIDER=liqpay`), logger redact paths

**Interfaces — produces:**
```text
interface PaymentProvider {
  checkoutForm(input: CheckoutInput): { action: string; fields: { data: string; signature: string } }
  verifyCallback(body: { data: string; signature: string }): ProviderEvent       // throws BILLING_SIGNATURE_INVALID
  status(orderId: string): Promise<ProviderEvent | null>                          // null = provider has no such order
  refund(orderId: string, amountMinor: number): Promise<ProviderRefundResult>
  unsubscribe(orderId: string): Promise<ProviderEvent>
  updateSubscription(orderId: string, amountMinor: number, currency: Currency, description: string): Promise<ProviderEvent>
}
CheckoutInput = { orderId; action: 'pay'|'subscribe'; amountMinor; currency; description; language: 'uk'|'en';
  resultUrl; serverUrl; expiresAt: Date; subscription?: { startAt: Date; periodicity: 'month'|'year' }; fiscal?: RroInfo }
ProviderEvent = { orderId; providerPaymentId: string|null; providerOrderId: string|null; action: 'pay'|'subscribe'|'regular'|'refund'|'other';
  outcome: 'SUCCEEDED'|'FAILED'|'PENDING'|'REVERSED'|'SUBSCRIBED'|'UNSUBSCRIBED'; rawStatus: string;
  amountMinor: number|null; currency: string|null; errCode: string|null; occurredAt: Date|null; safePayload: Record<string, unknown> }
```
- `liqpaySign(privateKey, data): string` = `base64(sha3-256(privateKey + data + privateKey))`; `encodeData(obj): string` = `base64(JSON.stringify(obj))`.
- Status mapping (`liqpay-status.ts`): `success → SUCCEEDED`; `failure, error → FAILED`; `reversed → REVERSED`; `subscribed → SUBSCRIBED`; `unsubscribed → UNSUBSCRIBED`; every other documented value (`*_verify`, `wait_*`, `processing`, `prepared`, `cash_wait`, `hold_wait`, `invoice_wait`, `try_again`) → `PENDING`; an unknown value → `PENDING` + a `warn` log `{rawStatus}`.
- HTTP: `fetch(LIQPAY_API_BASE + '/api/request', form-urlencoded {data, signature})`, 10 s timeout, no retries inside the adapter (callers decide), errors → `AppError('PAYMENT_PROVIDER_UNAVAILABLE', 503)`.
- `safePayload` = the whitelist in Deliberate choices; `amount` parsed with `parseAmountToMinor`, an unparsable amount → `null` (treated as mismatch downstream).

- [ ] **Step 1: Write the failing tests:**
  - `liqpaySign` reproduces the docs' worked example (`version 7`, the doc's public/private test key and `data`) → `0adgJ8F2Ds5HCVkcz4AlmdLMRoIJf7IxsL3QmeFRz/s=`;
  - `verifyCallback` with a tampered `data` (one char), a signature made with SHA-1, an empty signature, a non-base64 `data`, JSON that is not an object → each throws `BILLING_SIGNATURE_INVALID`; comparison uses `timingSafeEqual` on equal-length buffers;
  - `checkoutForm` puts `version: 7`, `public_key`, `amount: "7.34"`, `currency`, `order_id`, `server_url`, `result_url`, `language`, `expired_date` (`YYYY-MM-DD HH:mm:ss` UTC), and for `subscribe` `subscribe: 1`, `subscribe_date_start`, `subscribe_periodicity`; it never contains the private key (assert on decoded data and on the whole returned object's JSON);
  - `safePayload` drops `sender_first_name`, `sender_last_name`, `sender_phone`, `ip`, `sender_card_mask2`, `card_token`;
  - `status`/`refund` against a local HTTP stub: request body is form-encoded and signed; a 500 or a timeout → `PAYMENT_PROVIDER_UNAVAILABLE`;
  - env: `BILLING_PROVIDER=liqpay` without keys → startup error; production + live key (`public_key` not starting with `sandbox_`) + `BILLING_FISCAL_MODE=none` + `BILLING_FISCAL_WAIVED` unset → startup error ([P14]);
  - fiscal: `LiqPayRroReceipts.rroInfo(offer, priceMinor, email)` → `{items:[{id: rroItemId, amount: 1, price: "…", cost: "…"}], delivery_emails:[email]}`; an offer without `rroItemId` → throws at checkout (`OFFER_UNAVAILABLE`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (no SDK). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): LiqPay adapter behind the payment provider port`.

### Task 11: Payments and pack checkout

**Files:**
- Create: `apps/api/src/billing/checkout.service.ts`, `apps/api/src/billing/billing.controller.ts`, `apps/api/src/billing/payment-queries.ts`, `apps/api/test/billing-checkout.e2e.spec.ts`
- Modify: `schema.prisma` + migration `<ts>_billing_payments`

**Interfaces — produces (schema):**
```text
enum PaymentKind { PACK PACK_EXTENSION SUBSCRIPTION_START SUBSCRIPTION_RENEWAL SUBSCRIPTION_UPGRADE }
enum PaymentStatus { PENDING SUCCEEDED FAILED EXPIRED REVERSED REFUNDED PARTIALLY_REFUNDED }
Payment  id (= LiqPay order_id), userId → User RESTRICT, kind, status, offerId → RESTRICT, priceId? → RESTRICT,
         collectionId? → Collection SET NULL, subscriptionId? → Subscription RESTRICT, newCollectionTitle?,
         amountMinor int, currency, offerSnapshot jsonb, providerOrderId text UNIQUE, providerPaymentId text? UNIQUE,
         expiresAt, paidAt?, failedAt?, errCode?, refundedMinor int default 0, needsReview bool default false,
         mismatch bool default false, createdAt, updatedAt
CHECK Payment_amount_positive; Payment_refund_bounds (0 ≤ refundedMinor ≤ amountMinor);
CHECK Payment_paid_consistent ((status IN ('SUCCEEDED','REFUNDED','PARTIALLY_REFUNDED','REVERSED')) = (paidAt IS NOT NULL))
INDEX (userId, createdAt DESC, id DESC); INDEX (status, createdAt) WHERE status = 'PENDING'
UNIQUE (collectionId, offerId) WHERE status = 'PENDING' AND kind IN ('PACK','PACK_EXTENSION')
```
**Interfaces — produces (code):**
- `CheckoutService.create(principal, req: CheckoutRequest, locale): Promise<CheckoutResponse>`:
  - loads the **active** price + offer (else `409 OFFER_UNAVAILABLE`); `PACK` ⇒ offer kind `PACK`, collection (if any) owned, not `DELETING`, `entitlement = ACCOUNT`; `PACK_EXTENSION` ⇒ collection is `PACK`; `STORAGE` extension ⇒ the target tier `rank` > the current pack's offer rank, amount = target price − current tier's current price (≤ 0 ⇒ `409 OFFER_UNAVAILABLE`);
  - inside a transaction with the owner lock then the collection lock: reuse a live `PENDING` (same offer+price+target) → return a **fresh** form for it (same `order_id`, new signature) ; a different pending offer for the target → `409 PAYMENT_PENDING`;
  - inserts `Payment` (`expiresAt = now + BILLING_PENDING_TTL_MINUTES`), audit `billing.checkout`; returns the form from `PaymentProvider.checkoutForm` with `result_url = APP_ORIGIN/app/billing/return?payment=<id>` and `server_url = BILLING_CALLBACK_URL`.
- Routes: `GET /billing/offers` (`@Public()`; active offers with active prices), `POST /billing/checkouts` (`Idempotency-Key` not needed: the pending reuse is the idempotency), `GET /billing/payments`, `GET /billing/payments/:id` (own only).

- [ ] **Step 1: Write the failing tests:** a body with `amountMinor` → `400`; another user's `collectionId` → `404`; a `DELETING` collection → `404`; an inactive price → `409 OFFER_UNAVAILABLE`; a PACK for a collection that is already `PACK` → `409 OFFER_UNAVAILABLE`; two identical checkouts → same `paymentId`, both forms verify, one row; a different offer while pending → `409 PAYMENT_PENDING`; after `expiresAt` a new checkout creates a new row and the old one is `EXPIRED` (set lazily here or by Task 13's job); `STORAGE` upgrade from «Старт» (price 50000) to «Подія» (120000) → `amountMinor = 70000` computed server-side; `BILLING_PROVIDER=disabled` → `503 PAYMENT_PROVIDER_UNAVAILABLE` and no row; `GET /billing/offers` signed out → `200`, no inactive offers, no `rroItemId`/`features` keys beyond the DTO; the decoded form `data` contains our `order_id` and no private key; read-only accounts **can** check out (billing is on the allow-list).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `pnpm openapi:write`.
- [ ] **Step 5: Commit** `feat(api): payments and pack checkout`.

### Task 12: The callback, `PaymentEvent` and the payment state machine

**Files:**
- Create: `apps/api/src/billing/liqpay/liqpay-callback.controller.ts`, `apps/api/src/billing/payment-transitions.ts`, `apps/api/src/billing/pack-grants.ts`, `apps/api/test/billing-callback.e2e.spec.ts`
- Modify: `schema.prisma` + migration `<ts>_payment_events`

**Interfaces — produces (schema):**
```text
PaymentEvent id, provider text default 'liqpay', dedupeKey text UNIQUE (sha256 of the raw data string), verified bool,
             orderId text?, paymentId → Payment SET NULL?, payload jsonb, outcome text?, processedAt?, error text?, receivedAt
INDEX (processedAt) WHERE processedAt IS NULL AND verified
```
(Unverified bodies are **not** stored — a bad signature only logs and counts; storing attacker bytes buys nothing.)

**Interfaces — produces (code):**
- `PaymentTransitions.apply(tx, payment: Payment (locked FOR UPDATE), ev: ProviderEvent, source: 'callback'|'status'): Promise<'applied'|'noop'|'mismatch'|'review'>`, the only writer of `Payment.status`:
  - `PENDING|FAILED|EXPIRED + SUCCEEDED` → `SUCCEEDED`, `paidAt = ev.occurredAt ?? now`, then the grant (`PackGrants.applyPack` / `applyExtension`; subscription kinds in M3); a `FAILED`/`EXPIRED` payment that later succeeds is still honoured (money was taken);
  - `PENDING + FAILED` → `FAILED` (+ `errCode`); `SUCCEEDED + FAILED|PENDING` → `noop` (never regress);
  - `SUCCEEDED + REVERSED` → `REVERSED` + revoke the grant ([Q4]);
  - amount/currency differ from the snapshot → `mismatch = true`, nothing granted, `'mismatch'`;
  - a grant that would duplicate (PACK on a `PACK` collection) → `SUCCEEDED`, `needsReview = true`, `'review'`.
- `PackGrants.applyPack(tx, payment)`: create the collection when `collectionId` is null (`CollectionsService.createInTx`, title from the payment), set `entitlement = PACK`, insert `CollectionPack` from `offerSnapshot`, clear `deleteAfter`/stamps; `applyExtension(tx, payment)` per [P4].
- `POST /api/v1/billing/liqpay/callback` (`@Public() @SkipOriginCheck()`, throttled, 64 KB): verify → insert `PaymentEvent` `ON CONFLICT (dedupeKey) DO NOTHING` → if inserted: lock the payment by `order_id`, `apply`, stamp `processedAt` — all in one transaction → `200 {}`. Unknown `order_id` → event stored with `outcome = 'unknown_order'`, `200`.

- [ ] **Step 1: Write the failing tests** (callbacks signed with the test key from fixtures):
  - `success` for a pending PACK on an existing collection → `200`; the payment `SUCCEEDED`; the collection is `PACK` with `windowEndsAt = paidAt + 30 d`; the account trial collection slot is freed;
  - `success` for a PACK with `collectionId: null` → a new collection with the title and a default link;
  - the same body again → `200`, one `PaymentEvent`, one `CollectionPack`, one audit `billing.payment_succeeded`;
  - the same status re-encoded (different `data`, same meaning) → second event row, `apply` → `noop`;
  - 10 concurrent identical callbacks → exactly one grant;
  - `failure` then `success` (out of order) → `SUCCEEDED` and granted; `success` then `failure` → stays `SUCCEEDED`;
  - wrong `amount` → `mismatch`, nothing granted, `200`;
  - bad signature → `400 BILLING_SIGNATURE_INVALID`, no row, the log line has no `data`;
  - `Origin: https://evil.example` → still accepted (signature is the control), but no cookie-authenticated effect is possible (the route reads no session);
  - a WINDOW extension on a collection in `COLLECTING_CLOSED` → `ACTIVE` with `windowEndsAt = now + 30 d`; a RETENTION extension after `retentionEndsAt` → `COLLECTING_CLOSED` and `deleteAfter` cleared;
  - a second PACK payment succeeding for a collection that became `PACK` → `needsReview`, pack unchanged;
  - the urlencoded body is parsed by the default Express parser (no extra middleware).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): signed LiqPay callback and idempotent payment transitions`.

### Task 13: Reconciliation: return-page refresh and the worker job

**Files:**
- Create: `apps/api/src/billing/reconciliation.service.ts`, `apps/api/src/worker/handlers/billing-reconcile.handler.ts` (+ spec), `apps/api/test/billing-reconcile.e2e.spec.ts`
- Modify: `billing.controller.ts` (`GET /billing/payments/:id` triggers a throttled refresh), `job-names.ts` (`billing.reconcile` PERIODIC, `*/10 * * * *`), `job-runner.ts`

**Interfaces — produces:**
- `ReconciliationService.refreshPayment(paymentId): Promise<Payment>` — if `PENDING` and `createdAt < now − 30 s` and `lastCheckedAt < now − 15 s` (add `Payment.lastCheckedAt`), call `provider.status(orderId)` **outside** a transaction, then in a transaction lock + `PaymentTransitions.apply(…, 'status')`; provider error → return the payment unchanged.
- `BillingReconcileHandler.run(now)`: pending payments older than 2 min (batch 100) → `refreshPayment`; pending past `expiresAt + 15 min` with `status()` → `null` or still pending → `EXPIRED`; unprocessed verified `PaymentEvent`s older than 1 min → re-apply. (M3 adds subscriptions.)

- [ ] **Step 1: Write the failing tests** (provider stubbed at the port in these integration tests — a deliberate boundary, rule 18): a pending payment with no callback, `status` → `success` → granted once; the return poll and the job racing → one grant; `status` → provider 503 → payment stays `PENDING`, no error to the client; an expired pending with `status` null → `EXPIRED`; an `EXPIRED` payment whose callback `success` arrives later → `SUCCEEDED` + granted.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): payment reconciliation through the LiqPay status API`.

### Task 14: Pricing, checkout and pack UI; verification; PR M2

**Files:**
- Create: `apps/web/src/app/pricing/page.tsx` (public, server-rendered from `GET /billing/offers`), `apps/web/src/billing/offer-card.tsx`, `apps/web/src/billing/checkout-redirect.tsx` (builds a hidden `<form method="post" action={form.action}>` with `data`/`signature` and submits it), `apps/web/src/app/app/billing/return/page.tsx`, `apps/web/src/app/app/billing/page.tsx` (replaces the M1 placeholder: access, packs per collection, payment history), `apps/web/src/api/billing.ts`
- Modify: `pack-status.tsx` (window/retention countdowns, «Продовжити збір на 30 днів», «Продовжити зберігання на рік», «Збільшити обсяг»), the create-collection flow («Купити пакет для нової колекції»), `sign-in-landing.tsx` (link «Тарифи»), `messages/{uk,en}.json` (`billing.*`)

- [ ] **Step 0: Design pass.** Owners pay on phones: the pricing page is mobile-first, two pack cards and the subscriptions section (M3 fills it; M2 shows packs only), prices from minor units, the auto-renewal text is not needed for packs.
- [ ] **Step 1: Write the failing tests** (component + Playwright with the LiqPay stub, see Rule-19 Tests):
  - `/pricing` signed out shows «Старт» and «Подія» with their prices; «Обрати» goes to `/login` (magic links have no `returnTo`, slice 9 [P8]; after sign-in the user picks again in `/app/billing`);
  - signed in, «Купити для цієї колекції» → `POST /billing/checkouts` → the browser posts the form to the (stubbed) LiqPay checkout URL;
  - the stub "pays" → posts a signed `success` callback to the API and redirects to `result_url` → the return page shows «Оплату отримано» after its poll; with a `failure` callback → «Оплата не пройшла» + «Спробувати ще раз»; with no callback and stub `status` = `processing` → «Очікуємо підтвердження від банку» and keeps polling (every 3 s, up to 2 min, then «Перевіримо пізніше — статус з'явиться в «Тариф і оплата»»);
  - the return page ignores `?status=success` in its own URL (renders from the API only);
  - the collection page in `COLLECTING_CLOSED` shows «Збір завершено {date}» and «Продовжити збір»; the pack card shows `storage used / pack storage`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; screenshots.
- [ ] **Step 5:** Docs (`docs/deployment/billing.md`: sandbox setup O1/O2, callback URL), batched minors, full verification, PR M2.

---

## PR M3 — Subscriptions, renewals, grace and plan changes

### Task 15: Subscription checkout, the `subscribe` callback and renewal callbacks

**Files:**
- Create: `apps/api/src/billing/subscriptions.service.ts`, `apps/api/src/billing/subscription-transitions.ts`, `apps/api/test/billing-subscriptions.e2e.spec.ts`
- Modify: `checkout.service.ts` (`SUBSCRIPTION`), `payment-transitions.ts` (subscription kinds), `liqpay-callback.controller.ts` (renewal routing)

**Interfaces — produces:**
- Checkout `SUBSCRIPTION`: refuses `409 SUBSCRIPTION_EXISTS` when a live LiqPay subscription exists (a live complimentary grant is replaced on success, not refused); creates `Subscription {status: PENDING, source: LIQPAY, snapshot, providerOrderId = paymentId, autoRenewConsentAt = now, consentTermsVersion}` and `Payment {kind: SUBSCRIPTION_START}` in one transaction; the form uses `action: subscribe`, `subscribe_date_start = now`, `subscribe_periodicity = month|year`.
- `SubscriptionTransitions`:
  - start payment `SUCCEEDED` or provider `SUBSCRIBED` with the checkout's amount (S1b: that is how LiqPay reports the first charge) → `ACTIVE`, `currentPeriodStart = paidAt`, `currentPeriodEnd = addInterval(paidAt, interval)`; replaces a live comp grant (`EXPIRED`); clears `deleteAfter` of the account's `ACCOUNT` collections;
  - renewal: a callback with `action = regular` for the subscription's `providerOrderId` (unverified in sandbox, ADR 0018) and a new `payment_id` → insert `Payment {kind: SUBSCRIPTION_RENEWAL, providerPaymentId}` (`ON CONFLICT DO NOTHING`), then: `success` → `ACTIVE`, period advances from `max(currentPeriodEnd, …)` by one interval (a renewal after `EXPIRED` starts a new period at `paidAt`, Review Focus 4), apply a pending downgrade; `failure` → `PAST_DUE`, `graceEndsAt = currentPeriodEnd + BILLING_GRACE_DAYS` (unchanged if already set), enqueue `mail.billing-renewal-failed` once per period;
  - `UNSUBSCRIBED` from the provider (e.g. the card holder cancelled at the bank) → `CANCELED` with access to `currentPeriodEnd`.

- [x] **Step 0 (spike S1b, 2026-10-08; findings in ADR 0018):** with the subscription checkout behind a local flag, subscribe once in the sandbox through `pnpm dev:tunnel` (`subscribe_periodicity: day` if allowed): record the first callback (`subscribed`? a charge?), the next `regular` callback's `order_id` / `liqpay_order_id` / `payment_id` / `status`, and what `status` reports for the subscription's order; then `subscribe_update` and `unsubscribe`. Resolve every `[S1b]` tag in ADR 0018 and here before Step 1.
- [ ] **Step 1: Write the failing tests:** checkout without `autoRenewConsent` → `400`; with a live LiqPay subscription → `409 SUBSCRIPTION_EXISTS`; start success → `ACTIVE/SUBSCRIPTION`, 5 collections allowed; replayed start → one period; a `regular` success → period +1 month, one renewal `Payment`; the same `regular` replayed → no second advance; a `regular` failure → `PAST_DUE` → `GRACE` state, mail once; then a `regular` success → `ACTIVE`, `graceEndsAt` cleared; a renewal for an unknown subscription → event stored `unknown_order`; a comp grant replaced by a paid start.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): LiqPay subscriptions and renewals`.

### Task 16: Subscription clocks in the worker

**Files:**
- Modify: `schema.prisma` + migration `<ts>_subscription_clocks` (`Subscription.lastRefreshAt`, `lastRefreshOk bool`, `providerUnsubscribedAt`, `pendingProviderAmountMinor`, `renewalFailureNotifiedFor timestamptz?`), `billing-reconcile.handler.ts` (subscriptions), `billing-retention.handler.ts` (no change in rules; consumes the new states), `apps/api/src/mail/templates/billing-renewal-failed.ts`, `apps/api/test/billing-subscription-clocks.e2e.spec.ts`

**Interfaces — produces:**
- `ReconciliationService.refreshSubscription(subscriptionId)`: at `currentPeriodEnd + 1 h` and then hourly while `PAST_DUE`, ask `provider.status(providerOrderId)` (S1b: it answers the `subscribe` transaction; a `regular` answer, if LiqPay ever gives one, is applied as a renewal); apply a found renewal through `SubscriptionTransitions`.
- `BillingReconcileHandler` additions: `ACTIVE` with `currentPeriodEnd + 1 h < now` and no renewal → `refreshSubscription`, then `PAST_DUE` with `graceEndsAt`; `PAST_DUE` with `graceEndsAt < now` → only if the last `refreshSubscription` **succeeded** (no provider error) within the last hour → `EXPIRED`, `endedAt = currentPeriodEnd`, call `provider.unsubscribe` (best effort, retried by the next run until `UNSUBSCRIBED`; stamp `providerUnsubscribedAt`); `CANCELED` with `currentPeriodEnd < now` → `EXPIRED` (`endedAt = currentPeriodEnd`).

- [ ] **Step 1: Write the failing tests** (port stubbed): no renewal callback, `status` shows a successful regular charge → `ACTIVE` next period; `status` shows none → `PAST_DUE` → after 4 days `EXPIRED`, account `READ_ONLY`, `unsubscribe` called once, the retention handler sets `deleteAfter = currentPeriodEnd + 12 months`; provider down during grace end → stays `PAST_DUE` (Review Focus 5), log `billing.reconcile.provider_error`; worker paused 2 days then run → the same final states as an on-time run; `CANCELED` past period → `EXPIRED` without calling `unsubscribe` again.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(worker): subscription renewal, grace and expiry clocks`.

### Task 17: Cancel, resume, upgrade with proration, scheduled downgrade

**Files:**
- Modify: `subscriptions.service.ts`, `billing.controller.ts`, `checkout.service.ts` (`SUBSCRIPTION_CHANGE`), `subscription-transitions.ts`; Create: `apps/api/test/billing-plan-changes.e2e.spec.ts`

**Interfaces — produces:**
- `POST /billing/subscription/cancel` → `provider.unsubscribe` first; on success `CANCELED`, `cancelAtPeriodEnd = true`, `canceledAt`; on provider error `503` and nothing changes (we never show "cancelled" while LiqPay may still charge). Idempotent.
- `POST /billing/subscription/resume` (`CANCELED` before period end) → a new checkout `SUBSCRIPTION` charged now (S1b: a recurring checkout charges at once; a future `subscribe_date_start` was not verifiable), whose first period starts at the cancelled plan's `currentPeriodEnd`, so nothing paid is lost; returns a checkout form (the card must be re-confirmed at LiqPay). [Q6]
- `POST /billing/checkouts {kind: 'SUBSCRIPTION_CHANGE', priceId}`:
  - **upgrade** (target rank > current, same interval, status `ACTIVE`) → `prorate(...)`; waived → apply now + `provider.updateSubscription(newAmount)` → `{status: 'SUCCEEDED', form: null}`; else a `pay` checkout `Payment {kind: SUBSCRIPTION_UPGRADE}`; its success applies the new snapshot immediately (period unchanged) and calls `updateSubscription`; a failing `updateSubscription` leaves `pendingProviderAmountMinor` set and the reconcile job retries it (until it succeeds, renewals are charged at the old price → the job flags `needsReview` if a renewal at the old amount arrives);
  - **monthly ↔ yearly** [B14] → usage check as for a downgrade, then scheduled (`SCHEDULED`, nothing charged, nothing sent to LiqPay); at the period end the reconcile job unsubscribes the old plan and the owner pays the new one with a `SUBSCRIPTION` checkout of `pendingChange.priceId` (grace until then);
  - **downgrade** → usage check (`PLAN_DOWNGRADE_BLOCKED` with `details.excess: [{limit: 'activeCollections'|'storageBytes'|'collectionStorageBytes'|'guestLinks', used, allowed, collectionId?}]`) → `pendingOfferId/pendingPriceId`, applied at the next successful renewal (re-checked; if usage no longer fits → the pending change is dropped and an audit `billing.subscription_change` `{applied:false, reason:'usage'}` is recorded and the summary shows why);
  - in `PAST_DUE` → `409 PAYMENT_PENDING`.
- `DELETE /billing/subscription/pending-change` → clears a scheduled downgrade.

- [ ] **Step 1: Write the failing tests:** cancel → `unsubscribe` called, access stays `ACTIVE` until `currentPeriodEnd`; cancel with provider down → `503`, still `ACTIVE`, `cancelAtPeriodEnd = false`; upgrade Pro→Business half-way → upgrade payment `amountMinor` equals `prorate` (asserted with the Task 2 function), success → 20 collections at once, `updateSubscription` called with the Business price; upgrade 30 s before period end → waived, applied, no payment row; downgrade with 7 active collections to Pro (5) → `409` with `excess[0] = {limit:'activeCollections', used:7, allowed:5}`; downgrade that fits → scheduled, applied on the next `regular` success; usage grew before renewal → not applied, reason recorded; upgrade in `PAST_DUE` → `409 PAYMENT_PENDING`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): cancel, upgrade with proration and scheduled downgrade`.

### Task 18: «Тариф і оплата» and the plan picker

**Files:**
- Modify: `apps/web/src/app/app/billing/page.tsx` (current plan, usage meters, renewal or end date, cancel/resume, change plan, pending change, payment history), `apps/web/src/app/pricing/page.tsx` (subscriptions with a monthly/yearly toggle), `apps/web/src/billing/*` (plan picker, change-plan dialog with the prorated amount from a new `GET /billing/subscription/change-preview?priceId=` → `{chargeMinor, waived, effective: 'NOW'|'NEXT_PERIOD', blocked?: excess[]}`), `access-banner.tsx` (grace copy with the date), the account page (link «Тариф і оплата»), `messages/{uk,en}.json`
- Create: `apps/web/src/billing/auto-renew-consent.tsx`

- [ ] **Step 0: Design pass.**
- [ ] **Step 1: Write the failing tests:** subscribe without ticking «Я погоджуюся на автоматичне щомісячне списання {amount} до скасування. Скасувати можна будь-коли в «Тариф і оплата».» → the pay button is disabled and the API would refuse anyway; the change dialog shows «Доплата зараз: 350,00 ₴, далі 1 200,00 ₴/міс» for an upgrade and «З {date}: Pro, 500,00 ₴/міс» for a downgrade; a blocked downgrade lists «Архівуйте або видаліть 2 колекції» and «Звільніть 30 ГБ»; cancel confirm text «Доступ збережеться до {date}. Після цього колекції стануть лише для перегляду.»; payment history rows show amount, status badge (Оплачено / Не пройшла / Очікує / Повернено частково / Повернено), date; at 360 px the page has no horizontal scroll.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; screenshots.
- [ ] **Step 5: Commit** `feat(web): plan and payment page with plan changes`.

### Task 19: Docs, batched minors, verification, PR M3

- [ ] ADR 0018: subscription lifecycle diagram (states and transitions) and `[S1b]` outcomes; `docs/deployment/billing.md`: grace, reconciliation, what the operator does when a renewal is `needsReview`.
- [ ] Batched minors; `pnpm typecheck lint test build`, API suite, `pnpm e2e`; PR M3.

---

## PR M4 — `/ops` billing, refunds, fiscal mode, legal v3 and the full journeys

### Task 20: Offers and prices editor

**Files:**
- Modify: `operator-billing.controller.ts`, `apps/api/src/billing/offers.service.ts` (create), `apps/web/src/app/ops/billing/offers/page.tsx`, `offers/[id]/page.tsx`, `apps/web/src/ops/billing/offer-form.tsx`, `price-editor.tsx`; Create: `apps/api/test/operator-billing-offers.e2e.spec.ts`

**Interfaces — produces:**
- `GET /operator/billing/offers` (all, including inactive), `POST /operator/billing/offers` (create; `code` immutable after create), `PATCH /operator/billing/offers/:id` (titles, descriptions, limits, `rank`, `features`, `rroItemId`; the kind-shape CHECK applies), `POST /operator/billing/offers/:id/deactivate|activate`, `PUT /operator/billing/offers/:id/prices/:interval/:currency {amountMinor}` (deactivates the current price row and inserts a new one in one transaction — old payments keep pointing at the old row). Every write needs a `reason` and is audited (`billing.offer_*`, `billing.price_set` with old/new amount).
- No `DELETE` route exists.

- [ ] **Step 1: Write the failing tests:** changing «Старт» storage from 10 to 20 GiB leaves an existing `CollectionPack.storageBytes` at 10 GiB and a pending payment's `offerSnapshot` unchanged; a new checkout snapshots 20; setting a price creates a new row and keeps the old one inactive; a `TRIAL` offer edit changes the trial limits of live trials (documented: the trial is not a purchase); deactivated offers vanish from `GET /billing/offers` and their checkout → `409 OFFER_UNAVAILABLE`; a PACK without `windowDays` → `400` (DB CHECK mapped to `VALIDATION_FAILED`); non-operator → `404`.
- [ ] **Step 2–4:** FAIL → implement (editor: a table of offers; a detail form with limits in GB shown/entered as GB and stored as bytes; prices as «грн» with two decimals converted to minor units by one helper; reason dialog) → PASS; design pass + screenshots (desktop-first, usable at 360).
- [ ] **Step 5: Commit** `feat(ops): billing offers and prices editor`.

### Task 21: Payments, subscriptions and refunds in `/ops`

**Files:**
- Create: `apps/api/src/billing/refunds.service.ts`, `apps/api/test/operator-billing-refunds.e2e.spec.ts`, `apps/web/src/app/ops/billing/payments/page.tsx`, `payments/[id]/page.tsx`, `apps/web/src/app/ops/billing/subscriptions/page.tsx`, `apps/web/src/ops/billing/refund-dialog.tsx`
- Modify: `schema.prisma` + migration `<ts>_refunds`, `operator-billing.controller.ts`, `billing-reconcile.handler.ts` (pending refunds)

**Interfaces — produces (schema):**
```text
enum RefundStatus { PENDING SUCCEEDED FAILED }
Refund id, paymentId → Payment RESTRICT, amountMinor int CHECK > 0, status, reason text (1..500), operatorUserId uuid,
       idempotencyKey uuid, providerStatus text?, createdAt, completedAt?
UNIQUE (paymentId, idempotencyKey)
```
**Interfaces — produces (code):**
- `RefundsService.refund({ operatorId, paymentId, amountMinor, reason, idempotencyKey })`: lock the payment; `amountMinor ≤ amountMinor − refundedMinor − sum(PENDING refunds)` else `409 REFUND_EXCEEDS_PAID`; payment must be `SUCCEEDED|PARTIALLY_REFUNDED`; insert `Refund PENDING` + commit; call `provider.refund(orderId, amount)`; then lock again and set `SUCCEEDED` (+ `refundedMinor += amount`, status `REFUNDED` when equal, else `PARTIALLY_REFUNDED`) or `FAILED`; audit `billing.refund`. A provider timeout leaves `PENDING`; the reconcile job resolves it via `status` (`refund_amount`). Same key replayed → the existing refund.
- **A refund does not revoke the entitlement by itself** ([Q4] default); the operator revokes a pack or cancels a subscription separately (`POST /operator/billing/subscriptions/:id/cancel-now` → `unsubscribe` + `EXPIRED` now; `POST /operator/billing/packs/:collectionId/end` → `retentionEndsAt = windowEndsAt = now`), each with a reason and audit.
- `GET /operator/billing/payments?status=&email=&needsReview=&mismatch=&cursor=`, `GET /operator/billing/payments/:id` (payment, events' safe payloads, refunds, the account e-mail), `GET /operator/billing/subscriptions?status=&cursor=`.

- [ ] **Step 1: Write the failing tests:** partial refund 30000 of 120000 → `PARTIALLY_REFUNDED`, `refundedMinor = 30000`; a second refund of 100000 → `409 REFUND_EXCEEDS_PAID`; two concurrent refunds of 70000 each → one succeeds, one `409`; provider timeout → `PENDING`, then the job with `status` showing the refund → `SUCCEEDED`; replay with the same key → no second provider call; refund of a `FAILED` payment → `409`; a `reversed` callback after a full refund → no state regression; list filters `needsReview=true` and `mismatch=true` work; non-operator → `404`; no card data in any operator DTO.
- [ ] **Step 2–4:** FAIL → implement (lists with cursor pagination, a detail page with a refund dialog that shows «Буде повернено {amount} на картку покупця» and requires a reason) → PASS; design pass + screenshots.
- [ ] **Step 5: Commit** `feat(ops): payments, subscriptions and manual refunds`.

### Task 22: Legal v3, checkout consent wiring, fiscal mode, retention deletion on

**Files:**
- Create: `apps/web/content/legal/terms.{uk,en}.v3.md`, `privacy.{uk,en}.v3.md`
- Modify: `packages/contracts/src/legal.ts` (v3, `draft: true`, `requireReacceptance: true`, `effectiveDate` placeholder), `docs/legal/README.md` (history), `render.yaml` (`BILLING_RETENTION_DELETE_ENABLED=true` on staging only after the owner confirms), `checkout.service.ts` (`consentTermsVersion` must equal the current Terms version, else `400 LEGAL_VERSION_OUTDATED`), `env.ts` fiscal guard test

- [ ] **Step 1: Write the failing tests:** the legal registry test expects v3 for both; a subscription checkout with `termsVersion: 'v2'` → `400 LEGAL_VERSION_OUTDATED`; the Terms v3 (uk and en) contain the section headings «Оплата і тарифи», «Автоматичне продовження підписки», «Скасування», «Повернення коштів», «Пробний період», «Режим лише для перегляду і зберігання даних», «Видалення даних після закінчення оплаченого періоду»; Privacy v3 contains «Платіжні дані» (LiqPay as processor; Stepler stores no card data; what it stores: amounts, dates, payment ids) and the 12-month retention; every unknown is a `[ПЛЕЙСХОЛДЕР: …]` marker (prices, refund window, seller details ФОП/ТОВ, ЄДРПОУ/РНОКПП, address, fiscal receipts).
- [ ] **Step 2–4:** FAIL → write the drafts (uk first, en parity) → PASS.
- [ ] **Step 5: Commit** `feat(legal): v3 drafts with payments, auto-renewal, refunds and retention`.

### Task 23: Full journeys, sandbox checklist, docs, PR M4

**Files:**
- Create: `e2e/support/liqpay-stub.ts` (local HTTP server: stub checkout page, `/api/request` for `status`/`refund`/`unsubscribe`/`subscribe_update`, posts callbacks signed with the e2e test key), `e2e/tests/billing.spec.ts`, `docs/deployment/billing-sandbox-checklist.md`
- Modify: `e2e/playwright.config.ts` (`BILLING_PROVIDER=liqpay`, `LIQPAY_API_BASE=http://127.0.0.1:<stub port>`, test keys generated per run, `BILLING_CALLBACK_URL` → the e2e API)

- [ ] **Step 1: Write the journeys** (desktop on PRs; mobile in the nightly/stage run):
  1. sign up → trial banner → create 1 collection → a second → `COLLECTION_LIMIT_REACHED` message with «Обрати тариф»;
  2. time-travel the trial end (SQL) → read-only banner; the guest sees «Колекція доступна лише для перегляду» and the gallery; admin «Створити посилання» disabled;
  3. buy «Старт» for that collection → stub pays → return page «Оплату отримано» → guest can upload again; the pack card shows 30 days;
  4. window end (SQL) → guest «Збір завершено» → «Продовжити збір» → paid → open again;
  5. subscribe Pro monthly with the consent tick → `ACTIVE`; stub renewal failure → grace banner; stub success → banner gone; cancel → «Доступ до {date}»;
  6. operator: partial refund of the pack payment → history shows «Повернено частково»; grant comp «Business» to another account.
- [ ] **Step 2: Run** `pnpm e2e -- billing` three times in a row → PASS.
- [ ] **Step 3: Sandbox checklist** (manual, staging, owner O4): real sandbox keys; pay with `4242…4242`, `4000000000003063` (3DS), `4000000000000002` (fail); check callbacks arrived (ops payment detail shows the event) or reconciliation healed them; subscribe with `subscribe_periodicity` per the spike; cancel; refund partial and full; phone + laptop; no secrets in Render logs (search for `sandbox_` and `signature`).
- [ ] **Step 4:** Docs: ADR 0018 → "Accepted" only after the owner says so; `docs/product/PRODUCT.md` §22–23 replaced by a short "Implemented model" pointer to ADR 0018 (keeping §22's history line); `discovery-questions.md` D13 note "superseded 2026-10-07 by B1–B12"; mvp-architecture-spec billing section; README env table.
- [ ] **Step 5:** Batched minors, full verification, PR M4.

## Open questions for the owner (recommended default first; tasks follow the default)

**Owner answers (2026-10-07):** Q2 — the pack's year is the whole keeping period (no extra 12 months for packs) — confirmed. Q3 — existing accounts get a fresh 7-day trial; the operator grants complimentary plans in `/ops` — confirmed. Q5 — all four PRs (subscriptions included) ship before production — confirmed. Q9 — only the important mails (renewal failed, read-only, deletion warnings; receipts come from LiqPay) — confirmed. Q1 is with the owner's accountant (production blocker). The other questions follow their defaults unless the owner says otherwise.

1. **[Q1] Tax regime and fiscal receipts.** «ФОП 4 групи» is normally the agricultural single-tax group, which does not fit КВЕД 63.11 — please confirm the actual group (likely 2 or 3) or the ТОВ, and whether card payments for a digital service require ПРРО receipts in your case.
   - **Default:** build with `BILLING_FISCAL_MODE=none` and the `liqpay_rro` adapter ready; **production is blocked** until the accountant answers (startup guard [P14]).
   - **Alternative:** a separate ПРРО provider (Checkbox, etc.) — a second adapter behind the same port, later.
2. **[Q2] Is a pack's retention the read-only tail, or does B8's "12 more months" come on top?**
   - **Default:** the pack's retention (1 year from activation) is the whole keeping period; after it the collection is read-only and deleted at `retentionEndsAt` with 30/7-day warnings. The 12-month tail applies to trial and subscription collections.
   - **Alternative:** `retentionEndsAt + 12 months` for packs too (content kept up to 2 years for one payment; cheaper to explain as "always 12 months after").
3. **[Q3] Existing staging accounts on release.**
   - **Default:** everyone gets a fresh 7-day trial from the migration, and you grant complimentary plans in `/ops` to yourself and testers (O3).
   - **Alternative:** a complimentary grant for every existing account, ending on a date you pick.
4. **[Q4] What does a refund or a bank reversal do to what was bought?**
   - **Default:** a refund (operator) does not change entitlements automatically — the operator ends the pack or cancels the subscription explicitly if that is the intent. A provider `reversed` (chargeback-like) ends the pack/subscription automatically (access as if never paid; content goes read-only, kept per [P5]).
   - **Also:** a storage upgrade costs the difference between the two tiers' **current** prices (not what was paid); if the owner prefers "difference from what was paid", the snapshot has the paid amount.
5. **[Q5] Must subscriptions be in the first paid launch?**
   - **Default:** yes (B5), M3 before production. **Alternative:** launch with packs (M1+M2+M4), subscriptions days later — less risk at launch, since recurring renewals are the least verifiable part in sandbox.
6. **[Q6] Monthly ↔ yearly switch and resuming a cancelled plan.**
   - **Default:** an interval switch takes effect at the next period (like a downgrade, no proration); upgrade in `PAST_DUE` is refused until the renewal is paid; resuming a cancelled subscription goes through LiqPay checkout again (a new card confirmation), because a cancelled LiqPay subscription cannot be reactivated by API (as far as the docs show).
   - **Alternative:** prorated immediate interval switches (more money logic, more edge cases).
7. **[Q7] Legal: v3 or edit v2?**
   - **Default:** v3 drafts with `requireReacceptance: true` (v2 was accepted on staging; payments are material).
   - **Alternative:** edit the unreleased v2 in place (no re-acceptance on staging).
8. **[Q8] How long are payment records kept?**
   - **Default:** `Payment`, `Refund`, `Subscription` kept for as long as the account exists and at least the accounting period your accountant names (placeholder in Privacy v3, typically 3+ years); `PaymentEvent` safe payloads 3 years, then a sweep deletes them. They survive collection deletion.
9. **[Q9] Stepler's own payment e-mails.**
   - **Default:** none beyond renewal-failed, read-only and deletion warnings; the receipt comes from LiqPay / the fiscal receipt. No "trial ends tomorrow" mail (banner only).
   - **Alternative:** add «Пробний період закінчується завтра» and «Оплату отримано» mails (two templates, one job each).
10. **[Q10] Draft prices.** The seed has no prices (`[PRICE]`). Please give UAH prices for «Старт», «Подія», the three extensions, Pro and Business (monthly/yearly) — you can also enter them yourself in `/ops` after M4; until then staging uses the SQL snippet values.

## Checkpoints

- **After Task 4:** the router-enumeration gate test is green — read-only is proven before any payment work.
- **After Task 8:** the owner reviews M1 on staging (trial, read-only, comps) and accepts or amends ADR 0018.
- **After Task 9:** spike findings committed; every `[S1]` tag resolved before Task 12 (done 2026-10-07: pay, callbacks and signatures verified; the subscription questions moved to `[S1b]`, the first step of Task 15).
- **After Task 13:** callback + reconciliation reviewed as a whole (Review Focus 1 and 5) before any UI.
- **After Task 17:** proration and plan-change tests reviewed by the owner with real numbers ([Q10]).
- **After Task 23:** journeys pass 3 times in a row; the owner runs the sandbox checklist; production stays blocked on O5–O7.

## Out of scope

Invoices, acts and bank transfer for ТОВ clients (B12); promo codes and discounts; multi-currency pricing UI (the model supports it); VAT handling; self-service refunds (B11); per-plan feature flags in the UI (B9); account self-deletion (the billing precondition is recorded); Apple Pay / Google Pay as separate integrations (LiqPay `paytypes` covers them); dunning beyond the grace mails; usage-based billing; a separate billing service.
