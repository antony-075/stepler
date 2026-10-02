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
