# Stepler — Product Specification

**Status:** Product baseline / starting point  
**Purpose:** Source of truth for product discovery and MVP implementation  
**Important:** This document is a starting point, not an immutable specification. During architecture and implementation, Claude should identify contradictions, missing decisions, technical constraints and better alternatives. Product decisions that materially change scope must be surfaced for approval.

---

# 1. Product idea

## 1.1 One sentence

Stepler is a simple service for collecting photos, videos, documents and text from multiple people into a shared collection through a link or QR code.

## 1.2 The problem

After an event, trip, wedding, birthday, party, team event or other shared experience, content is scattered across:

- personal phone galleries;
- Telegram chats;
- WhatsApp chats;
- Google Drive folders;
- cloud links;
- social networks;
- separate people's devices.

The organizer often wants one place where everyone can quickly contribute their content without creating accounts or learning a complicated system.

## 1.3 Product promise

The guest should be able to:

**open a link → add content → finish**

with as little friction as possible.

The admin should be able to:

**create collection → share it → collect content → manage it**

without becoming a technical administrator.

---

# 2. Target users

## Primary

### Event organizer / admin

Examples:
- wedding organizer / couple;
- birthday host;
- person organizing a party;
- traveler organizing a group trip;
- team lead;
- company event organizer;
- family event organizer.

The admin owns the collection and controls guest access.

### Guest / contributor

A person who receives a collection link or scans a QR code.

The guest should not normally need to create an account.

## Secondary future users

- professional event organizers;
- photographers;
- businesses;
- communities;
- agencies;
- teams.

These are not separate MVP roles.

---

# 3. Core product model

## 3.1 Collection

A Collection is the primary container.

It can contain:

- photos;
- videos;
- documents;
- text.

The collection belongs to an admin.

## 3.2 Content / Asset

Every submitted item belongs to a collection.

Binary content is stored in object storage.

Application metadata is stored in PostgreSQL.

A content item may have:

- type;
- owner/contributor;
- original filename;
- MIME type;
- size;
- storage key;
- preview/thumbnail metadata;
- creation/upload timestamps;
- status;
- deletion state where applicable.

## 3.3 Guest Link

A collection has one default guest link.

The admin may create additional links/capabilities.

Different links may have different permissions/settings.

A link is a capability, not an identity.

Links must be revocable.

---

# 4. MVP

## 4.1 MVP goal

Validate the core product loop:

> Create collection → share link/QR → guests contribute → admin manages the collected content.

The MVP should be intentionally small and reliable.

---

# 5. MVP functionality

## 5.1 Admin authentication

The admin needs an authenticated account.

Requirements:

- secure login;
- secure session management;
- logout;
- protected admin routes;
- server-side authorization.

Authentication provider/implementation should be decided during architecture if not already fixed.

---

## 5.2 Admin dashboard

The admin can see their collections.

For each collection:

- name;
- basic metadata;
- content count;
- access/link information;
- basic status.

---

## 5.3 Create collection

Admin can create a collection.

Minimum configuration:

- title/name;
- optional description;
- basic visual settings if required by the final UX.

Creating a collection automatically creates its default guest link.

---

## 5.4 Collection management

Admin can:

- edit collection metadata;
- view collected content;
- delete content;
- manage guest links;
- change guest visibility/settings;
- archive/delete the collection according to the final retention model.

---

# 6. Guest experience

## 6.1 No mandatory guest account

A guest should be able to use a collection through its link without creating an account.

The exact mechanism for associating a guest with their submissions should be designed securely.

Do not use an email/password account as a prerequisite for MVP guest participation.

---

## 6.2 Guest landing

After opening a guest link, the guest sees:

- collection identity;
- what they can do;
- upload/add-content action;
- previously uploaded content if the link allows it.

The interface must be mobile-first.

---

## 6.3 Upload

Guests can upload:

- photos;
- videos;
- documents.

The upload experience should support multiple files.

Important states:

- selecting files;
- preparing;
- uploading;
- uploaded;
- failed;
- retrying;
- cancelled;
- partially completed.

Large files should upload directly to object storage using short-lived backend-authorized upload capabilities.

---

## 6.4 Text

Guests can submit text content.

The UX should make text contribution as simple as possible.

The exact formatting model is intentionally open for architecture/UX discovery.

---

# 7. Guest visibility

The admin can configure whether guests can see content uploaded before them.

This is a core product setting.

At minimum, support:

### Mode A — shared gallery

Guests can see permitted content that already exists in the collection.

### Mode B — contribution-only

Guests can submit content but cannot browse prior submissions.

The visibility rule must be enforced on the backend, not merely hidden in the frontend.

---

# 8. Guest links / capabilities

## Default link

Every collection has one default guest link.

## Additional links

Admin can create additional links with different access behavior.

Potential settings include:

- can view;
- can upload;
- can submit text;
- can delete own content;
- can see previous content.

Only settings approved for MVP should be implemented.

## Revocation

Admin can revoke an additional link.

The exact behavior of already-open sessions and active uploads must be explicitly defined during architecture.

---

# 9. Content ownership

The system distinguishes:

- collection owner;
- guest capability;
- content contributor.

## Admin

Can delete any content in their collection.

## Guest

May delete their own content when that permission is enabled.

A guest must never be able to delete another guest's content.

This must be enforced server-side.

---

# 10. QR codes

QR is a sharing mechanism, not the product itself.

MVP should support:

- generating a QR code for the default collection link;
- displaying/downloading it where useful.

The architecture should allow future customization.

Post-MVP may include:
- branded QR;
- poster;
- sticker;
- physical ordering.

---

# 11. Admin settings

Settings that materially affect guest behavior should be configurable from the admin UI.

MVP candidate settings:

- guest can upload;
- guest can view previous content;
- guest can delete own content.

The exact settings matrix should be finalized during UX/architecture discovery.

---

# 12. Content management

Admin needs a usable gallery/content view.

Minimum capabilities:

- browse;
- filter by type where useful;
- open/view content;
- delete;
- see basic metadata.

The first version does not need advanced DAM functionality.

---

# 13. Storage

## Object storage

Use S3-compatible object storage, with Cloudflare R2 as the current candidate.

Binary files belong in object storage.

PostgreSQL stores metadata and relationships.

## Security

Do not expose unrestricted storage credentials.

Use short-lived signed access.

Storage objects should not be directly guessable or expose sensitive information.

## Upload architecture

Preferred:

```text
Guest browser
    ↓
API: request upload authorization
    ↓
API validates link + permission + quota
    ↓
API creates short-lived signed upload URL
    ↓
Browser uploads directly to R2
    ↓
API confirms/records upload
```

NestJS must not proxy large media.

---

# 14. Supported content types

## MVP

- image;
- video;
- document;
- text.

The exact supported file extensions, MIME types and maximum sizes must be defined before implementation.

Do not assume unlimited file sizes.

---

# 15. Responsive design

Responsive behavior is a product requirement, not a later optimization.

Support:

- mobile phones;
- tablets;
- laptops;
- desktop monitors;
- wide monitors.

Guest experience should be mobile-first.

Admin experience should work exceptionally well on desktop while remaining usable on smaller screens.

---

# 16. Design system

The product should have a reusable component system.

Requirements:

- TypeScript;
- reusable UI components;
- Storybook;
- responsive primitives;
- accessible states;
- consistent spacing/typography/tokens.

Design should be created before implementing substantial UI.

Use the installed upstream design/UX skills.

---

# 17. Accessibility

Core flows should support:

- keyboard navigation;
- visible focus;
- semantic controls;
- accessible names;
- form validation;
- useful error messages;
- sufficient contrast;
- screen-reader-compatible status where appropriate.

Accessibility is particularly important for public guest flows.

---

# 18. Admin architecture

The first release is web-only.

There is no native mobile admin application in MVP.

The responsive web admin should nevertheless work on phones/tablets.

Native mobile admin is post-MVP.

---

# 19. API

Backend:

- NestJS;
- TypeScript;
- REST;
- Swagger/OpenAPI.

Frontend must not directly access the database.

Business authorization is server-side.

API contracts should be explicit.

---

# 20. Database

Current baseline:

- PostgreSQL;
- Prisma.

Expected conceptual domains:

- users;
- collections;
- guest links/capabilities;
- content/assets;
- upload sessions;
- text content;
- audit/event data where required.

These are conceptual entities, not a requirement to create one table per bullet.

The final schema must be derived from invariants and access patterns.

---

# 21. Third-party integrations

Default rule:

> Third-party services are integrated through the backend.

Exceptions are allowed only where the provider explicitly requires browser-side integration.

Expected future providers:

- Cloudflare R2;
- payment providers;
- email;
- analytics;
- monitoring.

Payment is not required to validate the basic collection workflow unless the launch plan explicitly pulls it into MVP.

---

# 22. Monetization

The product is intended to be monetizable.

Possible model:

- paid collection;
- storage/content quota;
- plan-based limits;
- future subscriptions.

Earlier concept:

Charge for a collection/content capacity rather than simply selling generic storage.

Example concept:

> User pays a fixed amount for a collection with a defined content allowance.

This is a product hypothesis, not an MVP pricing decision.

Payment providers discussed as candidates:
- Stripe;
- LiqPay;
- mono/MonoPay;
- Apple Pay / Google Pay through supported payment flows.

Provider selection, fees and integration architecture must be verified before implementation.

---

# 23. MVP monetization decision

Do not let payment complexity block the technical MVP unless monetization is explicitly part of the first launch.

The architecture must leave room for:
- entitlements;
- quotas;
- payments;
- refunds;
- provider webhooks.

But avoid building a full billing platform prematurely.

---

# 24. Post-MVP

Post-MVP is where the product can expand after the core loop is validated.

## 24.1 Physical products

Admin can order:

- posters;
- stickers;
- QR materials.

Possible flow:

```text
Collection
→ customize QR/material
→ preview
→ order
→ payment
→ fulfillment
```

---

## 24.2 QR customization

Possible:

- colors;
- logo;
- branded frame;
- call-to-action;
- collection branding.

QR remains compatible with ordinary scanning.

---

## 24.3 Advanced collection customization

Potential:

- cover image;
- themes;
- custom colors;
- typography;
- guest-side branding;
- custom welcome message;
- custom upload instructions.

---

## 24.4 Advanced access control

Potential:

- multiple capability presets;
- password-protected links;
- expiration;
- scheduled activation;
- more granular permissions;
- moderation.

---

## 24.5 Collection organization

Potential:

- folders;
- subcollections;
- albums;
- tags;
- filters;
- search.

Folder/Collection architecture should be considered early enough that MVP does not make future organization impossible, but folders themselves are not required for MVP.

---

## 24.6 Media processing

Potential:

- thumbnails;
- video previews;
- compression;
- transcoding;
- image optimization;
- duplicate detection.

---

## 24.7 Admin mobile app

Native mobile admin application.

Not required for MVP.

---

## 24.8 Analytics

Potential:

- collection views;
- unique guests;
- uploads;
- upload success rate;
- content types;
- activity timeline.

---

## 24.9 Notifications

Potential:

- email;
- push;
- admin notifications;
- upload summaries.

---

# 25. Future-proofing requirements

MVP architecture should not block:

- multiple guest links;
- permission variants;
- future folders;
- multiple content types;
- storage quotas;
- paid collections;
- payment providers;
- media processing;
- physical QR products;
- mobile admin.

However:

> Future-proofing does NOT mean implementing future features now.

Create clean boundaries and extensible data models where the cost is low.

Avoid speculative abstractions.

---

# 26. Non-goals

MVP is not:

- a full Google Drive replacement;
- a professional DAM;
- a social network;
- a full event-management platform;
- a native mobile consumer app;
- a complex team collaboration suite;
- a photo editing platform;
- a professional video hosting service.

---

# 27. Core user journeys

## Journey 1 — Admin creates collection

```text
Sign in
→ Dashboard
→ Create collection
→ Name/configuration
→ Collection created
→ Default guest link available
→ QR available
```

## Journey 2 — Guest contributes photos

```text
Open link
→ Collection guest page
→ Add photos
→ Select files
→ Upload
→ Progress
→ Success
```

## Journey 3 — Guest contributes multiple content types

```text
Open link
→ Add content
→ Photo / Video / Document / Text
→ Submit
→ Confirmation
```

## Journey 4 — Guest views previous content

Only when the link allows it:

```text
Open link
→ Collection
→ Existing gallery
→ Add content
```

## Journey 5 — Admin manages content

```text
Dashboard
→ Collection
→ Content
→ Browse/filter
→ Open
→ Delete/manage
```

## Journey 6 — Admin creates special link

```text
Collection
→ Guest access
→ Create link
→ Configure permissions
→ Generate
→ Share/revoke
```

---

# 28. Core edge cases

The architecture and UX must account for:

- expired/revoked link;
- guest opens invalid link;
- upload fails halfway;
- network disconnects during upload;
- browser closes during upload;
- duplicate completion request;
- unsupported file;
- file exceeds limit;
- collection deleted while guest is active;
- guest tries to access another content item;
- guest tries to delete another guest's content;
- admin revokes a link while it is open;
- object uploaded but database completion fails;
- database record exists but object is missing;
- duplicate submissions;
- storage provider outage.

---

# 29. Security requirements

Public guest access must be treated as hostile input.

Required:

- server-side authorization;
- capability-based guest access;
- revocation;
- scoped signed storage access;
- input validation;
- upload validation;
- rate limiting / abuse protection where appropriate;
- safe error messages;
- secure sessions;
- secret management;
- auditability for sensitive operations.

Particular threat:

> A guest must never gain access to another collection or another guest's private content by modifying IDs, URLs, request bodies, or frontend state.

---

# 30. Observability

MVP baseline:

- structured backend logs;
- request/error correlation;
- health endpoint;
- basic application error monitoring;
- storage/upload failure visibility.

Do not log:
- passwords;
- access tokens;
- signed URLs;
- payment secrets;
- unnecessary private content.

---

# 31. Infrastructure

Required environments:

- staging;
- production.

Each must have isolated:

- API;
- web;
- database;
- storage;
- secrets.

Docker should be used for reproducible development/runtime components where appropriate.

CI/CD should run at minimum:

- lint;
- typecheck;
- tests;
- build.

---

# 32. Product decisions still requiring confirmation

Claude must identify these before locking implementation:

1. Exact admin authentication method.
2. Guest capability/token model.
3. Exact guest identification/ownership mechanism for "delete own content".
4. Maximum file sizes by type.
5. Allowed document types.
6. Video size/duration limits.
7. Image/video processing requirements for MVP.
8. Collection deletion/retention policy.
9. Link expiration behavior.
10. Whether guest uploads require moderation.
11. Exact mobile guest UX.
12. Whether MVP includes payments.
13. Initial pricing/quota model.
14. Production hosting choices.
15. Email/notifications requirement.
16. Exact staging deployment strategy.

These questions should be resolved based on product/technical impact, not guessed silently.

---

# 33. Definition of MVP success

The MVP should prove that a real user can:

1. create a collection;
2. share it;
3. open it on a phone without registration;
4. upload multiple photos/videos/documents;
5. submit text;
6. optionally see prior content;
7. return to the admin panel;
8. review and delete content;
9. safely control guest access.

The core loop must feel fast, simple and reliable.

---

# 34. Product north star

The product should make this experience feel almost effortless:

> "I received a link, opened it, added my photos, and I'm done."

Every MVP decision should be evaluated against:
- friction;
- reliability;
- security;
- simplicity;
- cost.

Avoid adding complexity that does not materially improve one of these dimensions.
