# ADR 0013 — Content Reports and Platform Operator Role

Status: Accepted (accepted in discovery D15, F2; legal specifics open)
Date: 2026-09-29

## Context

Open registration means the collection owner may themselves be the source of illegal content, so reports cannot go only to the owner. No full moderation system or internal admin panel in MVP.

## Decision

- `ContentReport` created by anyone who can see the item; visible to the collection admin and to the operator.
- Operator = user with a verified email listed in `OPERATOR_EMAILS` config.
- Operator actions: hide/delete content, block/unblock collection or account, change report status. Exposed as operator API endpoints plus a minimal protected page.
- All operator actions are audited.
- Public abuse contact published in the legal documents: the `LEGAL_CONTACT_EMAIL` variable, rendered as the «Контакти» block of `/legal/terms` and `/legal/privacy` (slice 10, PR F1; `docs/legal/README.md`).

## Alternatives considered

- Reports only to the collection admin — misses owner-originated abuse.
- Role table / RBAC — premature for one operator group.

## Consequences

- Operator membership changes require a config change and deploy.
- Open legal decisions: reporter IP storage, evidence preservation, DSA applicability.
