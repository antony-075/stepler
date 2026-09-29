# Architecture Overview

## Target

A modular monolith in a monorepo.

```text
apps/
  web/        Next.js
  api/        NestJS
  worker/     background jobs (added in the processing slice)

packages/
  contracts/  Zod schemas, API contracts, error codes
  ui/         shared React components + Storybook
  config/     shared tooling/config

docs/
.claude/
docker/
```

## Runtime

```text
Browser
  |
  | HTTPS REST
  v
NestJS API
  |
  +--> PostgreSQL / Prisma
  |
  +--> Cloudflare R2 / S3-compatible storage
  |
  +--> external providers
```

For large file uploads:

```text
Browser
  |
  | request upload authorization
  v
NestJS API
  |
  | short-lived signed URL
  v
Browser
  |
  | direct upload
  v
R2
```

The backend remains authoritative for:
- ownership;
- authorization;
- quotas;
- upload state;
- completion;
- application metadata.

## Environments

Two environments:
- staging;
- production.

Each environment has isolated:
- application deployment;
- database;
- object storage namespace/bucket;
- secrets/configuration.

Never use production data as an informal staging database.

## API

REST + Swagger/OpenAPI.

URI versioning (`/api/v1`), problem+json errors, cursor pagination — see ADR 0004.

## Domain boundaries

Initial backend modules are expected to include:
- auth;
- users;
- collections;
- guest-links/capabilities;
- content/assets;
- uploads;
- reports/operator;
- limits;
- audit;
- storage, mail, jobs (provider ports);
- health/observability.

Avoid splitting these into services during MVP.

## Detailed architecture

See `mvp-architecture-spec.md` (accepted) and ADR 0004–0013.
