# API

REST API with Swagger/OpenAPI.

Initial resource areas:
- auth;
- collections;
- guest links;
- assets/content;
- uploads;
- collection settings.

Every public endpoint must document:
- authentication;
- authorization;
- request validation;
- success response;
- errors;
- pagination where applicable.

Guest endpoints must be reviewed specifically for capability leakage and IDOR/BOLA risks.

## Conventions and resource map

See ADR 0004 and `docs/architecture/mvp-architecture-spec.md` §8–§9 (status: accepted).

## Implemented in Phase 2

The machine-readable contract is `apps/api/openapi.json` (Swagger UI at `/api/docs` outside production). Request and response schemas live in `packages/contracts`.

### Errors

Every error is RFC 9457 `application/problem+json`:

```json
{ "type": "about:blank", "title": "Too Many Requests", "status": 429, "code": "RATE_LIMITED", "retryable": true, "requestId": "…" }
```

`code` is stable and translated by the web app; `requestId` matches the `x-request-id` response header. Unexpected errors are a generic `500 INTERNAL` with no detail.

| Code | Status | Meaning |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400, 413, 415 | Invalid body/query/params (`errors[]` lists issue paths), malformed JSON, body too large |
| `UNAUTHENTICATED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` | 404 | Unknown route or resource (also resources outside the caller's scope) |
| `CSRF_ORIGIN_MISMATCH` | 403 | Unsafe method without `Origin: APP_ORIGIN` |
| `RATE_LIMITED` | 429 | Per-IP limit hit; `Retry-After` is set |
| `TURNSTILE_FAILED` | 400 | Turnstile token rejected |
| `MAGIC_LINK_INVALID` | 400 | Link unknown, expired or already used |
| `OAUTH_FAILED` | redirect | Google sign-in failed (`/login?error=OAUTH_FAILED`) |
| `ACCOUNT_BLOCKED` | 403 / redirect | The account is blocked |
| `UPSTREAM_UNAVAILABLE` | — | Web client only: the API could not be reached or answered outside the contract |
| `DEPENDENCY_UNAVAILABLE` | 503 | A provider (e.g. Turnstile) did not answer; retryable |
| `INTERNAL` | 500 | Unexpected error |

### Auth and profile

| Method and path | Auth | Notes |
| --- | --- | --- |
| `GET /api/v1/auth/methods` | public | `{ magicLink, google, turnstileSiteKey }` |
| `POST /api/v1/auth/magic-link` | public, per-IP limit | `{ email, turnstileToken, locale? }` → `202 { status: "sent" }` for every address |
| `POST /api/v1/auth/magic-link/preview` | public, per-IP limit | `{ token }` → `{ email }`; does not consume |
| `POST /api/v1/auth/magic-link/verify` | public, per-IP limit | `{ token }` → `{ status: "signed-in" }` + `st_session` cookie |
| `GET /api/v1/auth/google/start` | public | 302 to Google; 404 when Google is not configured |
| `GET /api/v1/auth/google/callback` | public | 302 to `returnTo` (an `/app` path) or `/login?error=…` |
| `POST /api/v1/auth/logout` | public | 204, clears the cookie, idempotent |
| `GET /api/v1/me`, `PATCH /api/v1/me` | session | `{ id, email, displayName, locale, isOperator }`; PATCH `{ displayName?, locale? }` |
| `GET /api/v1/health/live`, `GET /api/v1/health/ready` | public | readiness: 200 or 503 with `database`/`storage` checks, cached 5 s |

All unsafe methods, public ones included, require `Origin` equal to `APP_ORIGIN`.
