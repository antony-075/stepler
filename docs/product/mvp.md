# MVP Scope

This file is a concise implementation checklist.

## Must have

- [ ] Admin authentication — e-mail + password with a confirmed address, and Google (ADR 0019, 2026-10-16; the magic link of Phase 2 is removed)
- [ ] Billing (owner decision 2026-10-07, ADR 0018) — built in M1–M4: a 7-day trial, packs, subscriptions through LiqPay in UAH, read-only after an unpaid end with content kept 90 days, the `/ops` billing console
- [ ] Admin dashboard
- [ ] Collection CRUD
- [ ] Default guest link
- [ ] Additional guest links/capabilities
- [ ] Link revocation
- [ ] Guest photo upload — built in slice 5 (PR C): direct multipart upload to storage, previews follow in PR D
- [ ] Guest video upload — built in slice 5 (PR C)
- [ ] Guest document upload — built in slice 5 (PR C)
- [ ] Guest text submission — built in slice 3 (PR A): plain-text wishes up to 5000 characters, numbered frames, an optional name asked once
- [ ] Guest visibility setting — built in slice 3 (PR A): a link shows the guest only their own frames or everyone's (`canViewGallery`); other guests' names and numbers are never shown
- [ ] Guest own-content deletion when allowed — built in PR E: own frames only, when the link allows it («Гості можуть видаляти своє»), from the viewer after a confirm
- [ ] Admin content deletion — built in slice 3 (one frame) and PR E (multi-select and bulk delete, up to 100 per request)
- [ ] Collection cover — built in slice 8a (PR F API, PR G web), now part of the guest page draft (PR J): upload an image (JPEG/PNG/WebP/HEIC/HEIF/GIF up to 50 MB) or make a guest photo the cover, replace, remove; shown on the dashboard card, in the share dialog and as the guest page hero once saved
- [ ] Guest welcome message — built in slice 8a, now part of the guest page draft (PR J): one paragraph up to 160 characters, shown to guests above their main action
- [ ] Guest page templates and tweaks (owner decision 2026-10-05, ADR 0017) — the editor built in PR J: the «Гостьова сторінка» tab with a live preview (phone/computer), background, accent, heading font, cover placement, alignment and corners on top of a template; an autosaved draft that guests see only after «Зберегти»; «Скинути зміни»; a conflict between tabs is refused, never overwritten; a bottom-sheet editor on phones. Six templates since PR K: «Класика», «На весь екран», «Журнал», «Листівка», «Вечірка», «Мінімалізм», each with a fixed scheme, the legal notice and the footer
- [ ] Responsive guest UI
- [ ] Responsive admin UI
- [ ] QR generation
- [ ] R2/S3-compatible object storage
- [ ] Signed upload/download access — built in slice 5 (PR C): presigned part URLs, window-aligned presigned GETs, downloads as attachments
- [ ] Legal pages (Terms, Privacy, uk/en, versioned) — built in slice 10 (PR F1): `/legal/terms` and `/legal/privacy` from Markdown with a registry of versions, a draft banner on placeholder texts, the contact e-mail from configuration, footer and guest-notice links
- [ ] Admin acceptance of Terms and Privacy — built in slice 10 (PR F2): a required checkbox on the sign-in card (since ADR 0019: the registration card, and Google), recorded when the account is created or the sign-in completes; the API refuses the app until both are accepted; `/accept-terms` for accounts from before it; «Правові документи» on the account page
- [ ] PostgreSQL + Prisma
- [ ] REST API
- [ ] Swagger/OpenAPI
- [ ] Storybook
- [ ] Docker-based local development
- [ ] Staging
- [ ] Production
- [ ] CI checks
- [ ] Error/logging baseline
- [ ] Critical authorization tests
- [ ] Critical upload tests
- [ ] Critical E2E flow

## Must not become MVP by accident

- Native mobile admin
- Physical product ordering
- Advanced analytics
- Full subscription platform (beyond ADR 0018: one provider, one charged currency, manual refunds)
- Complex moderation suite
- Full DAM features
- Social features
