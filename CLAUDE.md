# EventDrop — Claude Code Project Instructions

## 1. Project

EventDrop is a web-first content collection service.

A collection can contain:
- photos;
- videos;
- documents;
- text;
- future content types.

The primary use case is collecting content around an event or shared experience through a collection link / QR code.

The MVP is admin-first:
- only the owner/admin manages the collection;
- guests access a collection through a public guest link;
- the admin controls whether guests can see content uploaded before them;
- one collection has one default guest link;
- additional guest links/capabilities may be created with different permissions;
- the admin can delete any content;
- a user can delete their own content where the product rules allow it.

Do not invent product behavior that is not documented. If a requirement is ambiguous and materially affects architecture, security, data model, UX, cost, or scope, ask first and propose a sensible default.

## 2. Product scope

Read before implementing product functionality:
- docs/product/PRODUCT.md (canonical product specification)
- docs/product/mvp.md
- docs/product/post-mvp.md
- docs/product/user-stories.md
- docs/product/acceptance-criteria.md

Read before architectural or cross-cutting work:
- docs/architecture/mvp-architecture-spec.md
- docs/architecture/decisions/
- docs/architecture/discovery-questions.md (owner decisions from discovery)

MVP is intentionally small. Do not add post-MVP functionality unless required for the architecture or explicitly requested.

## 3. Technology baseline

Target architecture:

- Monorepo
- Frontend: Next.js + React + TypeScript
- Backend: NestJS + TypeScript
- API: REST
- API documentation: Swagger / OpenAPI
- Database: PostgreSQL
- ORM: Prisma
- Object storage: Cloudflare R2 or an S3-compatible abstraction
- UI component system: shared React package + Storybook
- State/query management: TanStack Query for server state; local UI state should remain local unless there is a concrete reason for global state
- Validation: shared schemas where useful, with server-side validation always authoritative
- Containerization: Docker
- Environments: staging and production

Do not introduce another framework, ORM, database, state manager, queue, cache, microservice, or infrastructure component without a concrete requirement and explicit architectural justification.

## 4. Integration boundary

Third-party services are backend integrations by default.

Never:
- put provider secrets in the browser;
- call third-party APIs directly from the frontend when the backend can own the integration;
- make the frontend authoritative for payment, permissions, quotas, or security decisions.

A direct browser-to-provider flow is allowed only when the provider's architecture requires it (for example, direct object-storage upload using a short-lived signed URL). In such cases:
1. backend authorizes the operation;
2. backend issues a constrained short-lived capability;
3. browser performs the required direct operation;
4. backend remains authoritative for resulting state.

## 5. Media architecture

Large files must not be proxied through NestJS.

Preferred flow:

Browser
→ backend requests upload authorization
→ backend validates collection/link/user/quota
→ backend creates short-lived signed upload URL
→ browser uploads directly to object storage
→ backend receives/validates completion
→ database records the asset

Design for:
- retries;
- cancellation;
- partial failures;
- duplicate completion;
- expired upload sessions;
- large files;
- thumbnails/previews;
- asynchronous processing.

Never expose unrestricted permanent storage credentials.

## 6. API

Use RESTful resource-oriented APIs.

Every endpoint must have:
- clear authorization rules;
- request validation;
- predictable response shape;
- documented error behavior;
- Swagger/OpenAPI documentation;
- tests for important authorization and failure cases.

Do not leak internal database models directly as the public API contract.

Use DTOs / response contracts where appropriate.

## 7. Database

PostgreSQL is the source of truth for application state.

Prisma is the data-access layer.

Database decisions must consider:
- ownership;
- authorization;
- uniqueness;
- referential integrity;
- deletion behavior;
- indexes;
- migration safety;
- future growth.

Do not denormalize prematurely.

Do not use application code to enforce constraints that PostgreSQL can enforce reliably.

## 8. Security

Treat every public guest link as an untrusted entry point.

Never rely on:
- hidden UI;
- client-side checks;
- collection IDs being secret;
- user-supplied ownership claims.

Authorization must be enforced server-side.

For every resource access path ask:
"Can user A access user B's resource by changing an ID, token, link, or request parameter?"

Public links must have explicit capabilities and revocation semantics.

Never log secrets, access tokens, signed URLs, payment credentials, or unnecessary personal data.

## 9. UX and design

Responsive quality is a first-class requirement.

The application must work properly on:
- phones;
- tablets;
- laptops;
- desktop monitors;
- wide monitors.

Do not design desktop-first and patch mobile later.

Use the installed design/UX skills where appropriate.

Before implementing a substantial UI feature:
1. understand the user goal;
2. define the interaction flow;
3. identify states;
4. consider mobile and desktop;
5. reuse existing design-system primitives;
6. consider accessibility;
7. only then implement.

Required states where applicable:
- loading;
- empty;
- success;
- error;
- disabled;
- permission denied;
- offline/failed upload;
- partial completion.

## 10. Component architecture

Build reusable components when there is real reuse or a stable visual/interaction pattern.

Avoid both:
- giant components containing unrelated behavior;
- premature abstraction for one-off UI.

Shared UI belongs in the shared UI package and should be represented in Storybook when it is a reusable component.

## 11. Testing

Testing is part of implementation, not a final cleanup step.

Use the project's installed testing skills and existing tooling.

Important areas:
- authorization;
- public guest links;
- collection ownership;
- upload lifecycle;
- quotas;
- deletion;
- payment/webhook logic;
- API validation;
- critical user flows.

Prefer tests that prove behavior rather than implementation details.

## 12. Requirements workflow

For non-trivial work:

1. inspect the current code/docs;
2. understand the request;
3. identify ambiguity;
4. ask only consequential questions;
5. propose alternatives when a design decision matters;
6. agree on behavior;
7. create/update a plan;
8. implement;
9. test;
10. review;
11. update documentation if architecture/product behavior changed.

Do not silently make major product decisions.

Do not ask unnecessary questions for trivial implementation details.

## 13. Architecture decisions

For consequential architectural decisions, create an ADR in:
docs/architecture/decisions/

An ADR should contain:
- context;
- decision;
- alternatives considered;
- consequences;
- date/status.

Prefer reversible, simple decisions.

Do not introduce complexity because it is fashionable or because a large-scale system might eventually need it.

## 14. Code quality

Prefer:
- explicit types;
- small cohesive modules;
- predictable naming;
- simple control flow;
- clear error handling;
- dependency inversion only where it provides real value;
- composition over unnecessary inheritance.

Avoid:
- `any` unless justified;
- duplicated business rules;
- hidden side effects;
- magic constants;
- dead abstractions;
- speculative infrastructure.

## 15. Git

Keep commits focused and understandable.

Do not mix:
- formatting-only changes;
- unrelated refactors;
- feature work;
- dependency upgrades

unless there is a concrete reason.

Never commit secrets, `.env` files containing credentials, generated local databases, or user media.

## 16. Definition of Done

A feature is not done merely because the code compiles.

Before declaring completion:
- implementation is complete;
- relevant tests pass;
- typecheck passes;
- lint passes;
- build passes;
- authorization is verified;
- responsive behavior is considered;
- accessibility is considered;
- errors are handled;
- docs are updated when needed;
- no known critical regression remains.

## 17. How Claude should behave

Act as a senior engineering partner, not a code autocomplete system.

You should:
- inspect before changing;
- challenge questionable assumptions;
- point out tradeoffs;
- propose simpler alternatives;
- identify risks;
- ask consequential questions;
- avoid unnecessary complexity.

You should not:
- rewrite working architecture without reason;
- invent requirements;
- over-engineer MVP;
- claim something was tested when it was not;
- claim a source/skill is verified without actually checking it.
