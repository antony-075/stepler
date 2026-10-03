# MVP Scope

This file is a concise implementation checklist.

## Must have

- [ ] Admin authentication
- [ ] Admin dashboard
- [ ] Collection CRUD
- [ ] Default guest link
- [ ] Additional guest links/capabilities
- [ ] Link revocation
- [ ] Guest photo upload
- [ ] Guest video upload
- [ ] Guest document upload
- [ ] Guest text submission — built in slice 3 (PR A): plain-text wishes up to 5000 characters, numbered frames, an optional name asked once
- [ ] Guest visibility setting — built in slice 3 (PR A): a link shows the guest only their own frames or everyone's (`canViewGallery`); other guests' names and numbers are never shown
- [ ] Guest own-content deletion when allowed
- [ ] Admin content deletion
- [ ] Responsive guest UI
- [ ] Responsive admin UI
- [ ] QR generation
- [ ] R2/S3-compatible object storage
- [ ] Signed upload/download access
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
- Full subscription platform
- Complex moderation suite
- Full DAM features
- Social features
