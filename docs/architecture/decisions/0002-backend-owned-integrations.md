# ADR 0002 — Backend-Owned Third-Party Integrations

Status: Accepted
Date: 2026-09-29

## Decision

Third-party integrations are owned by the backend by default.

The frontend may communicate directly with a provider only when the provider's architecture requires it, such as direct object-storage upload with a short-lived signed URL.

## Consequences

- provider secrets stay server-side;
- business state remains authoritative on the backend;
- provider changes are isolated;
- browser direct-upload is possible without exposing storage credentials.
