# ADR 0020 — Self-service account deletion

Status: Accepted (2026-10-21)
Date: 2026-10-21

## Context

Until now an account could be closed only by e-mail to the operator (Terms v1–v3 §8). The launch checklist (item 1.9) asks for self-service deletion in «Акаунт», which the privacy texts also lead users to expect.

An account cannot simply be removed:

- `Payment` and `Subscription` reference `User` with `onDelete: Restrict`;
- payment records must be kept for accounting (Privacy v3 §11);
- `Collection.ownerId` is also `Restrict`; collections go through the asynchronous purge (D2) because their objects live in R2.

Owner decisions (2026-10-21):

- delete **at once** after confirmation, with no waiting period;
- confirm through a **link mailed to the account's address**;
- re-registering with the same address is a **new account with a new trial**; nothing about the old account is kept to recognise it.

## Decision

- **Request.** `POST /api/v1/me/deletion` (signed in, open before the legal gate) issues an `AuthEmailToken` with purpose `DELETE_ACCOUNT`, valid 60 minutes and single use. It is mailed to the account's own address. A newer link replaces the older one, as with every mailed token. The per-address hourly mail limit applies; over it the answer is `429`. The operator service account gets `403`.
- **The link's page** `/delete-account?token=…` is public, because the link may open in another browser; the token proves the mailbox. It has `Referrer-Policy: no-referrer`, `noindex`, and is disallowed in `robots.txt`.
  - It previews read-only (`POST /api/v1/auth/account-deletion/preview`: the address, the number of collections, whether a plan would renew), so mail scanners delete nothing.
  - «Видалити акаунт назавжди» confirms (`POST /api/v1/auth/account-deletion/confirm`).
- **Before deleting**, refusals that change nothing and keep the link usable:
  - a still-payable checkout gives `409 PAYMENT_PENDING`;
  - every LiqPay subscription LiqPay may still charge is unsubscribed through `SubscriptionProviderSync.unsubscribe`, ended ones included. If LiqPay does not confirm, the answer is `503 PAYMENT_PROVIDER_UNAVAILABLE`.
- **The deletion** is one transaction that consumes the token and locks the user row:
  1. Non-expired subscriptions end now (`EXPIRED`, like the operator's «Завершити зараз»), with no refund.
  2. Every collection not already `DELETING` goes through `CollectionDeletion.markDeleting`, audited with `reason: account_deletion`. The usual purge removes objects and rows.
  3. Sessions, sign-in methods (`AuthAccount`), the password, mailed tokens and legal acceptances are deleted.
  4. The user row is **anonymised**:
     - the e-mail becomes `deleted-<id>@deleted.invalid` (unique, undeliverable);
     - `emailVerifiedAt`, `displayName` and `readOnlyNotifiedAt` are cleared;
     - the status becomes the new `UserStatus.DELETED`, with `deletedAt` set (CHECK `User_deleted_consistent`).
  5. One audit event `account.delete` records counts only.

  The response clears the session cookie.
- **Afterwards:**
  - `SessionService` already rejects any non-`ACTIVE` user;
  - guest routes treat an owner who is not `ACTIVE` like a blocked one (`410 COLLECTION_UNAVAILABLE`), so they stay closed even without the `DELETING` collections (pre-launch security review, 2026-10-21);
  - neither the address nor the Google link can reach the old row;
  - the address is free, so registering again creates a new user with a new trial;
  - the operator console shows such an owner as «Видалений власником», with no block actions.

## Alternatives considered

- **Hard delete with `SetNull` on payments.** It would lose who paid, which accounting needs while the records are kept, and it would make `Payment.userId` nullable everywhere. Rejected.
- **A 7-day grace period with cancellation.** It protects against mistakes, but it needs a new account state, reminder mail and a sweep. The owner chose immediate deletion. The mailed link and the explicit page are the protection.
- **Confirm in a dialog by typing the address.** Simpler, but anyone with an open session could delete the account. Rejected for the mailed link.
- **Keeping a hash of deleted addresses to deny a second trial.** That is personal data the Privacy Policy would have to describe, and another address gets a trial anyway. Rejected.

## Consequences

- Two migrations:
  - `20261021100000_account_deletion_values` adds the enum values `UserStatus.DELETED` and `AuthTokenPurpose.DELETE_ACCOUNT`;
  - `20261021100100_account_deletion` adds `User.deletedAt` and its CHECK.

  The values get a migration of their own because PostgreSQL cannot use a value in the transaction that adds it.
- A deleted account's audit events keep its id as `actorId`, which no longer leads to an address.
- Moderation quarantine and reports of the account's frames go with their collections in the purge.
- Terms v3 §8 and §19 and Privacy v3 (the retention list and §12; drafts) now describe self-service deletion; they stay marked for the lawyer.
- Not done: a mail confirming the deletion afterwards, and operator-side deletion (the operator still blocks, or the owner deletes).
