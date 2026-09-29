# Database

## Baseline

PostgreSQL + Prisma.

## Initial conceptual entities

Likely entities:
- User
- Collection
- GuestLink / AccessCapability
- Asset
- UploadSession
- TextContent or a generalized Content model
- Audit/event records where needed

These are conceptual starting points, not an instruction to create every table immediately.

Before implementing the schema, Claude must:
1. inspect requirements;
2. identify invariants;
3. model ownership and authorization;
4. define deletion semantics;
5. identify indexes from access patterns;
6. challenge unnecessary entities.

The final schema should be documented in an ADR if significant tradeoffs are involved.

## Proposed model

The draft domain model, invariants and indexes are in `docs/architecture/mvp-architecture-spec.md` §7 (status: accepted). The schema is implemented slice by slice.
