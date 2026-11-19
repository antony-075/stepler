# Stepler

Stepler collects photos, videos, documents and text from many people into one shared collection, through a link or a QR code.

After a wedding, a trip, a birthday or a team event, content ends up scattered across phone galleries, chats and cloud folders. With Stepler the organizer creates a collection and shares its link. Guests open it and add their content without creating an account.

- **Guest:** open a link → add content → done.
- **Admin:** create a collection → share it → collect content → manage it.

> **Status:** MVP in active development. Staging is live; production is not launched yet.

## Features

- **Collections** with photos, videos, documents and text notes.
- **Guest links and QR codes.** Every collection has a default guest link; the admin can add more links with their own permissions, and pause, rotate or revoke them.
- **Visibility control.** The admin decides whether guests see content uploaded before them.
- **Direct uploads.** Large files go straight from the browser to object storage through short-lived signed URLs; the API never proxies file bytes.
- **Media processing.** A background worker makes previews (including HEIC photos and video posters) and strips location metadata from originals.
- **Guest page templates** with a live-preview editor for the admin.
- **Moderation.** Content reports, an operator console and appeals.
- **Accounts.** Email and password sign-in with email verification, plus Google sign-in.
- **Billing.** A trial plus storage packs paid through LiqPay.
- **Languages:** Ukrainian and English.
- **Responsive design.** The guest UI is mobile-first and the admin UI works from phone to wide desktop.

## Tech stack

| Area | Technology |
| --- | --- |
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js 16, React, TypeScript, TanStack Query, React Hook Form + Zod |
| UI | Tailwind, shadcn/ui, Radix, Storybook |
| API | NestJS (modular monolith), REST, OpenAPI/Swagger |
| Background jobs | Worker on pg-boss (PostgreSQL-backed queue) |
| Database | PostgreSQL + Prisma |
| Object storage | Cloudflare R2 (S3-compatible); SeaweedFS locally |
| Email | SMTP (Brevo on staging, Mailpit locally) |
| Bot protection | Cloudflare Turnstile |
| Payments | LiqPay |
| Hosting | Render (Docker images), separate staging and production |
| Tests | Vitest, API integration tests against real PostgreSQL, Playwright E2E (Chromium, WebKit) |

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/api` | NestJS REST API and the background worker |
| `apps/web` | Next.js web app: guest pages, admin and operator console |
| `apps/templates` | Guest page templates and their Storybook gallery |
| `packages/contracts` | Zod schemas shared by the API and the web app |
| `packages/ui` | Shared UI components + Storybook |
| `packages/config` | tsconfig, ESLint and Prettier presets |
| `e2e` | Playwright tests against production builds |
| `docker` | Local infrastructure (Docker Compose) and image checks |
| `docs` | Product, architecture (ADRs), deployment, UX and development docs |

## Getting started

### Prerequisites

- Node.js 24 (`.nvmrc`)
- pnpm 11 via corepack: `corepack enable`
- Docker
- Media tools for the worker: macOS `brew install libheif ffmpeg exiftool`; Ubuntu `sudo apt-get install libheif-examples libheif-plugin-libde265 ffmpeg libimage-exiftool-perl`

### Run locally

```sh
pnpm install

# Environment files (local-only values; never commit real credentials)
cp docker/.env.example docker/.env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Infrastructure: PostgreSQL, Mailpit, S3 emulator
pnpm infra:up
pnpm storage:bootstrap
pnpm db:deploy

# Apps
pnpm dev          # web on :3000, API on :4000
pnpm worker:dev   # background worker, in a second terminal
```

| What | Address |
| --- | --- |
| Web app | http://localhost:3000 |
| API | http://localhost:4000/api/v1 |
| Swagger UI (local only) | http://localhost:4000/api/docs |
| Mailpit (sent email) | http://127.0.0.1:8025 |
| Storybook | `pnpm storybook` → http://localhost:6006 |

Ports, extra databases and troubleshooting are covered in [docs/development/README.md](docs/development/README.md).

## Common commands

| Command | What it does |
| --- | --- |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Quality checks (Turborepo, cached) |
| `pnpm e2e` | Build and run the Playwright suite (needs `pnpm infra:up`) |
| `pnpm build` | Build all packages and apps |
| `pnpm db:migrate` / `pnpm db:studio` | Create migrations / open Prisma Studio |
| `pnpm openapi:write` | Regenerate `apps/api/openapi.json` |
| `pnpm release:check` | Full pre-release check: format, lint, typecheck, tests, builds, E2E, Docker images |

The complete command list is in [docs/development/README.md](docs/development/README.md#commands).

## Branches and deployment

```
feature branch ──PR──► dev ──PR──► stage ──PR──► main
                      local     staging       production
```

- `dev` is the default branch; feature work starts from it.
- Changes reach `dev`, `stage` and `main` only through pull requests with merge commits. The branches are protected.
- CI runs secret scanning (gitleaks), lint, typecheck, tests, E2E and Docker image checks.
- Deploys to Render are manual: `pnpm deploy:staging` and `pnpm deploy:production`. See [docs/deployment](docs/deployment).

## Documentation

| Topic | Where |
| --- | --- |
| Product specification | [docs/product/PRODUCT.md](docs/product/PRODUCT.md) |
| MVP scope and user stories | [docs/product](docs/product) |
| Architecture | [docs/architecture/mvp-architecture-spec.md](docs/architecture/mvp-architecture-spec.md) |
| Architecture decisions (ADRs) | [docs/architecture/decisions](docs/architecture/decisions) |
| Development setup | [docs/development/README.md](docs/development/README.md) |
| Deployment | [docs/deployment](docs/deployment) |
| Design system and UX | [docs/ux](docs/ux) |

## Security

Please report vulnerabilities privately through **Security → Report a vulnerability** on this repository; do not open a public issue. See [SECURITY.md](SECURITY.md).

## License

Copyright © 2026 Anton Shapoval. All rights reserved.

This repository is public so that the code can be read. It is not open source: no license is granted to copy, modify, distribute or host this code, or to use it in other projects, without written permission from the author.
