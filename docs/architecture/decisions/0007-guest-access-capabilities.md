# ADR 0007 — Guest Links, Capabilities and Guest Sessions

Status: Accepted (product rules accepted in discovery D7, D8, D12, F3–F5)
Date: 2026-09-29

## Context

Guests have no accounts. Links are revocable capabilities. Guests may delete their own content, which requires an ownership mechanism that does not use IP, User-Agent, fingerprinting or localStorage as authorization. The default link can be rotated; ownership must survive rotation.

## Decision

- `GuestLink` has six permissions: `canUploadPhotos`, `canUploadVideos`, `canUploadDocuments`, `canSubmitText`, `canViewGallery`, `canDeleteOwn`. At least one of the first five; `canDeleteOwn` requires a contribution permission (an upload type or text). View-only links are allowed. (Amended 2026-10-02 by the owner: the single `canUploadFiles` became three upload types, so a link can take photos and videos but not documents; existing links kept their value in all three.)
- States: `ACTIVE`, `INACTIVE` (reversible pause), `REVOKED` (terminal). The default link can be deactivated or rotated (old → REVOKED, new → ACTIVE), never revoked without replacement. Exactly one non-revoked default link per collection (partial unique index). (Amended 2026-10-02 by the owner: an additional link can also be deleted, `DELETE /guest-links/{id}`. A delete revokes the link if it is live and sets `hiddenAt`, so it leaves the admin's list; the row is never removed, because audit events and future guest content reference it. A revoked link can be deleted the same way to clear it from the "Revoked" list. The default link cannot be deleted (`409 DEFAULT_LINK_NOT_REVOCABLE`).)
- Token: 32 random bytes, base64url. Stored as SHA-256 hash (lookup) and AES-256-GCM ciphertext (re-display to owner) with a key ID for rotation.
- `GuestSession` belongs to the collection; `currentLinkId` records the capability in use. Opening another valid link of the same collection with a valid session cookie re-binds the session; permissions always come from the current link.
- Cookie per collection, path-scoped to `/api/v1/guest/collections/{collectionId}`, `HttpOnly; Secure; SameSite=Lax`.
- Guest context is revalidated on every request (link active, collection active and unblocked, owner unblocked). Changes and revocation take effect on the next request.

## Alternatives considered

- Session bound to link — rotation would orphan ownership.
- One device-wide cookie — links a guest's activity across collections.
- Plaintext or HMAC-derived tokens — DB leak exposure, or secret rotation breaks printed QR codes.

## Consequences

- Losing the cookie (other browser, in-app browser, cleared data) loses delete ability for prior content.
- An encryption key becomes a managed secret per environment.

## Implementation notes (slice 3, 2026-10-03)

- **Two-step exchange ([C3]):** `POST /guest/links/resolve` returns the link's state and the `collectionId`; `POST /guest/collections/{collectionId}/session` then creates or re-binds the session and sets the cookie. The second call is under the cookie's path, which is what makes re-binding possible at all. A token of another collection on the path is `404`. Spec §9.1 is amended accordingly.
- **Cookie:** `st_gs`, `HttpOnly; SameSite=Lax; Path=/api/v1/guest/collections/{collectionId}; Max-Age=34560000` (400 days, the browsers' cap), `Secure` per `COOKIE_SECURE`; renewed on every exchange. No server-side expiry (D12).
- **Revalidation:** `GuestSessionGuard` resolves the session from the cookie on every guest collection request and applies the [G5] states of its current link and collection (`assertLinkUsable`, shared with the resolver). Missing, unknown or foreign cookie: `401 GUEST_SESSION_REQUIRED`; the web re-runs the exchange once.
- **Name on the session ([O4], [C4]):** `GuestSession.contributorName` and `nameAnsweredAt`; a rename updates the session's live items in the same transaction. This amends the earlier "the name is not stored on the session".
- **PostgreSQL enforces the collection:** composite keys tie a session's current link and an item's session to the row's own collection (`ON DELETE SET NULL (contributorGuestSessionId)` for items, PostgreSQL 15+).
- **`canDeleteOwn` exposed (PR E, 2026-10-04, [C15]):** the link editor shows «Гості можуть видаляти своє», enabled only while the link takes some contribution (the `GuestLink_delete_own_needs_contribution` rule); turning every contribution off turns it off. Existing links keep `true`. Guest delete re-checks it against the session's current link on every request.
- **Limits:** session exchanges 120 / minute per IP; guest texts 60 / hour per session and 60 / minute per IP; guest reads 600 / minute per IP and route.
