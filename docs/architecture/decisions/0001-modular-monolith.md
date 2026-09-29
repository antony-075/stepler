# ADR 0001 — Modular Monolith for MVP

Status: Accepted
Date: 2026-09-29

## Context

EventDrop is initially a small product with a web frontend, REST API, PostgreSQL database and object storage.

## Decision

Use a modular monolith for the MVP.

Frontend and backend are separate applications inside one monorepo. Backend domains remain modular internally.

## Alternatives

- Microservices
- Separate repositories
- Serverless-only backend

## Consequences

Positive:
- simpler local development;
- simpler deployment;
- lower operational cost;
- easier cross-domain changes;
- fewer distributed-system failure modes.

Negative:
- backend must maintain clear module boundaries;
- future extraction will require deliberate boundaries if scale demands it.
