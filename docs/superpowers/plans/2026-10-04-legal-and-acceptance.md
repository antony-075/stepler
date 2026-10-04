# Stepler Phase 4, Slice 10: Legal Pages and Acceptance Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public, versioned Terms of Service and Privacy Policy pages (uk/en) whose texts can be swapped without code changes; every admin accepts both documents once, server-side, before using the app; guests see a short notice with links next to the contribution action; a privacy/abuse contact e-mail comes from configuration; production cannot start on placeholder texts.

**Architecture:**
- **Registry in `@stepler/contracts`** (`legal.ts`): one entry per document = its current version (`version`, `effectiveDate`, `draft`, `requireReacceptance`), plus the pure function `legalStatus(acceptances)` the API and the web share. The **bodies** are Markdown files in the repo, `apps/web/content/legal/<slug>.<locale>.<version>.md`, rendered server-side (RSC, no client JavaScript) at `/legal/terms` and `/legal/privacy`. Publishing a new version = a new file pair + a registry change; nothing else moves.
- **Acceptance starts on the sign-in card** (owner decision [L1]): a required checkbox; the card sends the current document versions with the magic-link request (stored on the `MagicLinkToken` row) or with `GET /auth/google/start` (stored in the signed OAuth transaction), and the API writes the `LegalAcceptance` rows **in the transaction that completes the sign-in** (verify / callback), for the user it creates or finds. The **API is authoritative**: versions are validated against the registry (`400`), a sign-in without them is refused, and `AuthGuard` answers `403 LEGAL_ACCEPTANCE_REQUIRED` on every non-public route except `GET /me`, `PATCH /me` and `POST /me/legal-acceptances` until each required document has an acceptance row. The interstitial `/accept-terms` is the **fallback only**: accounts from before this slice, a stale link whose stored versions are no longer current, future `requireReacceptance` bumps. No IP is stored; the request id is.
- **Readiness check:** the web server refuses to start when a current document is still a draft or `LEGAL_CONTACT_EMAIL` is unset, unless `LEGAL_ALLOW_DRAFT=true` (dev, CI, staging). Production never sets the flag, so guest contribution cannot reach production on placeholder texts ([C20]).

**Tech Stack:** As slices 1–8 (NestJS 12 ESM, Prisma 7 on PostgreSQL 18, Zod 4 contracts, Next.js 16 App Router + next-intl, TanStack Query 5, Tailwind 4 + shadcn/Radix in `@stepler/ui`, Vitest, Playwright 1.63). One new dependency, `marked` (Markdown → HTML on the server; rule 14 check in Task 1). No other dependency.

**Spec:**
- `docs/product/PRODUCT.md` §5.1, §6.2, §29; `docs/product/mvp.md`; `docs/product/acceptance-criteria.md` (API, Responsive);
- `docs/architecture/mvp-architecture-spec.md` §4 (routes, "RSC … static legal pages"), §6 ("Legal acceptance"), §7.1 `LegalAcceptance`, §9 (`POST /me/legal-acceptances`), §14, §15, §16;
- ADR 0006 (sessions, guards), 0011 ("Legal documents versioned per locale"), 0013 ("public abuse contact published in the legal documents"), 0014 (Render);
- `docs/architecture/discovery-questions.md` D15, F2, F6, F8;
- `docs/design/DESIGN-SYSTEM.md` §6.0, §6.9, §9; `docs/ux/design-system.md` (implemented inventory);
- `BOOTSTRAP.md` slice 10 and gate [C20]; the slice 2 and guest-content plans for conventions;
- **Owner decision 2026-10-04:** no legal texts exist yet; build the whole mechanism with placeholder texts clearly marked as drafts, in uk and en; real texts and the contact e-mail come later and must be swappable without code changes to the mechanism; development must not invent legal wording.

## Prerequisites

- `dev` contains PR E (`0b677d9`). Branches for this plan are cut from the then-current `dev`.
- **Concurrent work:** `docs/superpowers/plans/2026-10-04-collection-appearance.md` (cover + welcome message on the guest page) edits the `<header>` block of `GuestCollection` in `apps/web/src/guest/guest-page.tsx` and the `guest` namespace of `apps/web/messages/*.json`. This plan touches the same file (Task 3: `ContributeActions`, below the header) and the same namespace. Rule: the guest notice lives in `ContributeActions`, never inside the `<header>`; new `guest.*` keys go at the **end** of the namespace; whichever PR merges second rebases and re-runs `pnpm e2e -- --grep guest`.
- **Owner decisions 2026-10-04:** **[L1] decided by the owner** (checkbox on the sign-in card, interstitial as fallback); **[L2]–[L4] accepted as recommended.** Tasks are written against these answers.

## Decisions (owner answers 2026-10-04)

1. **[L1] How an admin accepts — owner decision: a required checkbox on the sign-in card; the interstitial stays as the fallback.**
   - The card shows «Я приймаю Умови використання та Політику конфіденційності» (links open in a new tab) to everyone — it cannot know whether the address is new without revealing it — and **both** «Отримати посилання для входу» and «Продовжити з Google» stay disabled until it is checked. The copy is neutral: no «Продовжуючи…» claim; the checkbox is the acceptance.
   - Transport of the intent: magic link → the request body carries `legal: { terms, privacy }` (current versions), stored on the `MagicLinkToken` row and applied at verify; Google → the versions travel in the signed `st_oauth` transaction (`apps/api/src/auth/google/oauth-cookie.ts`: HMAC-SHA256 with the HKDF key `st_oauth`, bound to `state` and compared in constant time) and are applied in the callback. In both flows the `LegalAcceptance` rows are written in the same transaction that creates the user or completes the sign-in, idempotently (`createMany … skipDuplicates`).
   - Server-side enforcement, not only disabled buttons: a magic-link request without `legal` → `400 VALIDATION_FAILED`; with a version that is not current → `400 LEGAL_VERSION_OUTDATED`; `GET /auth/google/start` without valid versions → `302 /login?error=LEGAL_ACCEPTANCE_REQUIRED` (or `…LEGAL_VERSION_OUTDATED`) and no `st_oauth` cookie, so Google is never contacted. Versions are validated against the registry: no arbitrary strings are ever stored.
   - `/accept-terms` remains for: accounts created before this slice (staging users, once), a link whose stored versions are outdated by the time it is used (nothing is recorded; the gate sends the user there), and future `requireReacceptance` bumps. The `AuthGuard` gate is unchanged.
   - Alternative that was recommended and not chosen: the interstitial as the primary path (one code path, no token columns, no transport). Cost of the chosen design: two transport paths and two more columns; benefit: acceptance is recorded at the moment registration starts, as F8 describes.
2. **[L2] What one acceptance stores — accepted as recommended: `userId, document, version, acceptedAt, requestId` — no IP address.** F8 allows IP "within legally justified necessity"; nothing in the product needs it, the request id already correlates the acceptance with the request log, and ADR 0013/spec §14 keep "no IP stored" as the default until a lawyer decides. Alternative: an HMAC of the IP as `MagicLinkToken.requestIpHash` does; one column, reversible later without a backfill.
3. **[L3] A new document version does not force re-acceptance** (F8) — accepted as recommended: the registry entry has `requireReacceptance: false` by default; `legal.accepted` is true when the user accepted **any** version of each document. Setting `requireReacceptance: true` on a version (a separate product/legal decision, in the same commit as the new text) sends everyone to the interstitial once more for that document. The account page shows the accepted version and the current one.
4. **[L4] Where the "no drafts in production" gate runs** — accepted as recommended: **at web server start**, in `src/instrumentation.ts` (`register()`), reading `LEGAL_ALLOW_DRAFT` and `LEGAL_CONTACT_EMAIL` from the runtime env. `next dev` (`NODE_ENV=development`) is always allowed, so nobody's local setup breaks; every built server (CI's e2e servers, the image check, **staging**) sets `LEGAL_ALLOW_DRAFT=true`; production never does. A failed start fails Render's health check and the previous version keeps serving. Alternative: fail `next build`; the same image is not shared between environments on Render, so it would also work, but it needs the flag plumbed into `turbo run build`, the Dockerfile (`ARG`) and CI, three more places to get wrong.

## Deliberate choices (low risk; override if you disagree)

- **Documents and slugs:** `TERMS` ↔ `/legal/terms`, `PRIVACY` ↔ `/legal/privacy`. Version ids are `v1`, `v2`, … (`LEGAL_VERSION_PATTERN = /^v[1-9]\d{0,3}$/`); the file name carries the slug, locale and version: `terms.uk.v1.md`.
- **Markdown, not MDX or TSX:** a lawyer delivers text; Markdown needs no developer to convert and does not fight the `react/jsx-no-literals` rule. Rendered with `marked` inside a server component (`dangerouslySetInnerHTML` of repo-controlled content; a unit test rejects raw HTML in the files so nothing but Markdown ever gets in). The page supplies the `h1` from the message catalog; the files start at `##`.
- **Placeholders are structural:** a `> Чернетка — текст буде замінено.` / `> Draft — text to be replaced.` line, then three neutral numbered sections `## 1. [Назва розділу буде надана]` with one `- [Текст буде надано]` bullet each (en: `## 1. [Section title to be provided]`, `- [Text to be provided]`). No pretend-legal prose, no invented section names.
- **Draft banner:** `role="note"`, warning tone (`Alert variant="warning"`), text `legal.draftBanner`; shown whenever the registry entry has `draft: true`; also printed.
- **Contact block** («Контакти») on both legal pages: one sentence naming the channel for privacy requests and content complaints (F6, F2) with a `mailto:` link to `LEGAL_CONTACT_EMAIL`; omitted when the variable is unset (only possible with `LEGAL_ALLOW_DRAFT=true`). The reports flow itself is slice 9.
- **Footer links:** `SiteFooter` gains a `<nav aria-label>` with «Умови використання» · «Політика конфіденційності»; it is already on the landing/login and is added to the guest route and the legal pages. The admin gets the same two links under the sidebar sections (hidden in the collapsed icon rail; the account page's «Правові документи» block carries them too, so the rail loses nothing).
- **Guest notice** sits in `ContributeActions` under the buttons (the dock on phones, under the title from 640px, the side sheet from 1024px), `type-small text-muted-foreground`, links open in a new tab with `rel="noopener noreferrer"`; `/g/*` already sends `Referrer-Policy: no-referrer`, so the link token never leaks as a Referer. A view-only link has no actions and no notice.
- **Gate exemptions** are exactly: `@Public()` routes, `GET /me`, `PATCH /me` (the language switch on the interstitial saves the profile locale), `POST /me/legal-acceptances`. Everything else, operator routes included, is 403 until accepted.
- **Endpoint (fallback path):** `POST /me/legal-acceptances {acceptances: [{document, version}]}` (1–2 items) → `200 MeResponse` (idempotent: `createMany … skipDuplicates`); a version that is not the current one → `400 LEGAL_VERSION_OUTDATED` and nothing is written. Partial acceptance (one document) is allowed; `legal.accepted` flips only when every document is satisfied. `LEGAL_VERSION_OUTDATED` is `400` everywhere (the client sent stale data: refetch `GET /auth/methods` or `GET /me` and retry).
- **One recording function** for every path: `LegalService.recordAcceptance(tx, userId, versions: LegalVersions, requestId)` writes rows only for versions that are **current at that moment** (a stale link records nothing and the gate takes over); used by magic-link verify, the Google callback and the fallback endpoint.
- **Token columns:** `MagicLinkToken.legalTermsVersion` / `legalPrivacyVersion` (`String?`, CHECK on the pattern); nullable so rows issued before this slice still verify (they record nothing). Two columns rather than JSON: both documents are fixed and the CHECK stays declarative.
- **Google start** takes the versions as query parameters `terms`, `privacy` next to `returnTo` (a plain anchor on the card; no JavaScript needed to carry them) and stores them in the transaction; the callback re-validates against the registry before recording.
- **Sign-in card buttons disabled until the box is checked** is the owner's explicit choice and overrides DESIGN-SYSTEM §9 «кнопка отправки не дизейблится до начала запроса» for this one form; the disabled buttons carry `aria-describedby` to the checkbox's hint so the reason is announced.
- **Session resolution** gains `legalAccepted` through one `include` on the existing query (no second query per request, no denormalized column).
- **Registry test** lives in the web app (it needs the files): every `LEGAL_DOCUMENTS` entry has a non-empty file for both locales, no `# ` heading, no raw HTML.
- **PR split:** two PRs so the pages (and the runbook the lawyer needs) can ship and go to staging while the acceptance mechanism is reviewed; the first touches `guest-page.tsx`, the second does not.

## PR split

| PR | Branch | Tasks | Ships | Promote to `stage`? |
|---|---|---|---|---|
| F1 | `feat/phase-4-legal-pages` | 1–4 | registry, placeholder texts, `/legal/terms` + `/legal/privacy` (uk/en, draft banner, contact block, print), readiness check, footer links, admin sidebar links, guest notice, runbook | yes, after owner action E1 |
| F2 | `feat/phase-4-legal-acceptance` | 5–9 | `LegalAcceptance` table, `GET /me.legal`, `POST /me/legal-acceptances`, API gate, acceptance transport at sign-in (magic link + Google), sign-in card checkbox, `/accept-terms` fallback, account «Правові документи», ADR 0016, spec/BOOTSTRAP updates | yes (existing staging accounts see the fallback interstitial once) |

Each PR ends with its own "docs, batched minors, full verification, PR" task, merged with a merge commit.

## Owner-only actions (agents never see or write secrets)

| Id | When | Action |
|---|---|---|
| E0 | after merging F1 (optional) | Add `LEGAL_CONTACT_EMAIL=privacy@example.com` to `apps/web/.env` to see the contact block locally. `next dev` runs without any new variable (drafts are allowed in development). |
| E1 | before promoting F1 | In Render → `stepler-staging` → Environment, enter `LEGAL_CONTACT_EMAIL` (a placeholder such as `privacy@example.com` is fine on staging). `LEGAL_ALLOW_DRAFT=true` comes from `render.yaml` (Task 2). |
| E2 | before production | Provide the real Terms and Privacy texts (uk + en) and the real contact e-mail; publish them per `docs/legal/README.md` (`draft: false`); set `LEGAL_CONTACT_EMAIL` in production; never set `LEGAL_ALLOW_DRAFT` there. Until then guest contribution stays on staging ([C20]). |

No new application secret is introduced.

## Pre-implementation gate (rule 19)

- **Similar code:** `getSessionUser()` / `fetchAuthMethods()` (`apps/web/src/api/server.ts`), `LoginForm` (`apps/web/src/app/login/login-form.tsx`), `MagicLinkService.request/verify/signInByEmail`, `GoogleController.start/callback` + `oauth-cookie.ts` (signed transaction), `GoogleSignInService.signIn`, `CenteredPage` + `VerifyPanel` (one-step page), `AccountPage` → `SettingBlock`, `SiteFooter`, `AdminNav`, `AuthGuard` + `@Public()`, `CurrentPrincipal`, `RequestId`, `MeController`/`UsersService`, `signInAs` (API tests), `requestLink()`/`signIn()` (e2e), `ukrainian-copy.test.ts` (catalog tests), `landing-container` (`@utility` precedent).
- **Data:** new `LegalAcceptance` + enum `LegalDocument`; `User.legalAcceptances`; two nullable columns on `MagicLinkToken`. No change to existing rows.
- **API:** `GET /me` gains `legal`; `GET /auth/methods` gains `legal` (current versions); `POST /auth/magic-link` requires `legal`; `GET /auth/google/start` requires `terms` + `privacy`; new `POST /me/legal-acceptances`; two error codes; a gate in `AuthGuard`.
- **Permissions:** unchanged roles; a new precondition (acceptance) on every account route except three.
- **Third parties:** none. No provider SDK anywhere; `marked` runs on the server only.
- **Retry / partial failure:** acceptance is idempotent by `(userId, document, version)`; the rows are written in the sign-in transaction, so a session never exists without them unless the stored versions were stale (then the gate + fallback). A lost response is followed by a `GET /me` that already says `accepted: true`. **Expiration:** a magic link (15 min) or OAuth transaction (10 min) that outlives a version bump records nothing — fallback. **Deletion:** cascades with the user. **Mobile:** legal pages and the interstitial are plain documents/forms in the existing page frame; the guest notice adds one small line to the dock.
- **Tests:** contracts unit (`legalStatus`), web unit (registry/files, readiness), API integration (gate matrix, idempotency, outdated version, both sign-in flows, `GET /me` shape, 401), Playwright (pages uk/en, draft banner, no-JS, 404, footer links, guest notice + referrer, first sign-in interstitial once).
- **Scope:** MVP slice 10. Not here: reports (slice 9), cookie consent (no third-party cookies exist), a privacy-request form (F6: e-mail channel).

## Global Constraints

- **Branches:** one per PR as in "PR split", cut from `dev`, PR to `dev`, merge commit; never push to `dev`/`stage`/`main` directly (rule 15). One commit per task.
- **Pace over polish:** per-task review raises only important findings (correctness, security, data integrity, accessibility blockers); minors are batched into each PR's last task. One full verification per PR.
- **No legal wording from engineering.** Placeholder bodies are exactly the structural template in "Deliberate choices". UI sentences that mention the documents (the guest notice, the interstitial checkbox) are placeholders too and say so in a code comment with the key name, so the lawyer's text replaces them in `messages/*.json` only.
- **Contracts:** schemas in `@stepler/contracts` (strict objects, no `.transform()`, no `z.date()`); the registry and `legalStatus` are plain exports next to them; new error codes appended to `ERROR_CODES` with uk/en messages; DTOs map explicitly — never a Prisma row.
- **Database:** additive migration created with `--create-only`, the raw-SQL CHECK appended and named (ADR 0005); `pnpm db:check` passes; ids `uuidv7()`.
- **Env:** each new variable goes into `apps/web/src/env.ts`, `apps/web/.env.example`, `turbo.json` `passThroughEnv` (`dev`, `e2e`), `e2e/playwright.config.ts` (web `webServer.env`), `docker/scripts/verify-images.sh` (the web container), `render.yaml` (web service) and the README env table.
- **Authorization:** the gate is in `AuthGuard` (server), never only in the web; `GET /me` stays the one source the web redirects on. The checkbox is enforced server-side on both sign-in entry points (`400` / redirect with an error code); disabled buttons are UX, not the control. Versions accepted from a client are only ever the registry's current ones.
- **Secrets & privacy:** no IP on acceptance rows; acceptance rows and logs carry ids and versions only; `/g/*` keeps `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex` and no third-party script; the legal pages are indexable (`robots` default) and the interstitial is not.
- **OpenAPI:** `@ApiTags('Me')`, `@ApiCookieAuth`, `@ApiResponse({ standardSchema })` + documented error codes; `pnpm openapi:write` in the same commit as the API change.
- **Web:** server components for the legal pages (no client JS, `marked` output only); TanStack Query for `me`; no literal UI strings (uk default, en parity; the `uk` catalog rules in `ukrainian-copy.test.ts` apply); touch targets ≥ 44 px; nothing hover-only; no horizontal scroll at 320/360/390; the submit button of the interstitial is not disabled before the request (DESIGN-SYSTEM §9 «Формы»).
- **Design pass (every UI task):** before writing the screen apply the frontend-design skill, `.claude/skills/ui-ux-pro-max`, `web-design-guidelines`, `responsive-design`; write the decisions as a 5–10 line header comment in the screen's main file; after implementing, screenshots at 360×780, 390×844 and 1440×900, light and dark (legal page also in print preview), saved to `$TMPDIR/stepler-legal-screens/<pr>/` (not committed) for the owner's design review before the PR.
- **Never** start/stop the owner's dev servers (web 3000, API 4010), run migrations against the owner's dev database, or touch `apps/*/.env`; `pnpm e2e` is safe alongside them (ports 3100/4100, `stepler_e2e`).
- **Dependencies:** only `marked`, checked under rule 14 in Task 1 (latest stable version, licence MIT, zero runtime dependencies, maintained in the last 6 months, server-only import).

## Review Focus

1. **A route the gate forgot.** A user with no acceptance rows (every pre-slice account) calls `GET /collections`, `GET /me/usage`, `POST /collections`, an operator route (`OPERATOR_EMAILS` user), and the three exempt routes. Expected: `403 LEGAL_ACCEPTANCE_REQUIRED` on everything except `GET /me`, `PATCH /me`, `POST /me/legal-acceptances` and public routes; `@Public()` guest routes are untouched. Test in Task 6.
2. **The card is bypassed or stale.** (a) `POST /auth/magic-link` without `legal`, or with `terms: 'v9'`, or with `terms: '<script>'`; `GET /auth/google/start` without `terms`/`privacy`. Expected: `400 VALIDATION_FAILED` / `400 LEGAL_VERSION_OUTDATED` with no token row and no mail; the Google start redirects to `/login?error=…` without setting `st_oauth`. (b) A link requested with `v1` is used after `v2` became current (same for an OAuth transaction, and for the fallback page submitting `v1`). Expected: the sign-in succeeds but records nothing, `GET /me` says `accepted: false`, the gate answers `403`, the web lands on `/accept-terms` showing `v2`; the fallback `POST` with `v1` → `400 LEGAL_VERSION_OUTDATED`, no row, the page refetches and the next submit with `v2` succeeds. Tests in Tasks 6, 7 (API) and 8 (web).
3. **Doubles and retries.** The same `POST /me/legal-acceptances` sent twice and two in parallel; a magic-link verify for a user who already has rows; a Google sign-in of an existing accepted user with the versions in the transaction. Expected: `200`/sign-in succeeds, exactly one row per `(userId, document, version)`, `legal.accepted: true`. Tests in Tasks 6 and 7.
4. **The legal page as a document, not an app.** No JavaScript, a 320 px phone, zoom 200 %, print: the whole text is readable, headings are real `h2`s, the version and effective date are visible, links work, nothing scrolls horizontally; `/legal/unknown` → 404; `/legal/terms` in a browser whose language is English renders English. Tests in Task 2 (unit) and Task 4 (e2e).
5. **The guest's link must not leak through the notice.** Tapping «Умови використання» on `/g/{token}` opens a new tab whose `document.referrer` is empty and whose opener is null; the guest page keeps its state (upload queue untouched). Test in Task 4. The same new-tab rule holds for the links beside the sign-in checkbox: opening them must not lose a typed e-mail or the Turnstile token (Task 8 journey).

---

## PR F1 — Legal pages, readiness check, links and the guest notice

### Task 1: Legal document registry, placeholder texts and the Markdown loader

**Files:**
- Create: `packages/contracts/src/legal.ts`, `packages/contracts/src/legal.test.ts`
- Modify: `packages/contracts/src/index.ts` (export everything below)
- Create: `apps/web/content/legal/terms.uk.v1.md`, `terms.en.v1.md`, `privacy.uk.v1.md`, `privacy.en.v1.md`
- Create: `apps/web/src/legal/slugs.ts`, `apps/web/src/legal/documents.ts`, `apps/web/src/legal/documents.test.ts`
- Modify: `apps/web/package.json` (dependency `marked`), `pnpm-lock.yaml`

**Interfaces — produces (contracts):**
- `legalDocumentKeySchema = z.enum(['TERMS', 'PRIVACY'])`, `type LegalDocumentKey`.
- `LEGAL_VERSION_PATTERN = /^v[1-9]\d{0,3}$/`.
- `interface LegalDocumentVersion { document: LegalDocumentKey; version: string; effectiveDate: string /* YYYY-MM-DD */; draft: boolean; requireReacceptance: boolean }`.
- `LEGAL_DOCUMENTS: readonly LegalDocumentVersion[]` — exactly one entry per document; initial: `{ document: 'TERMS', version: 'v1', effectiveDate: '2026-10-04', draft: true, requireReacceptance: false }` and the same for `PRIVACY`.
- `currentLegalVersion(document: LegalDocumentKey): LegalDocumentVersion`.
- `interface LegalAcceptanceRecord { document: LegalDocumentKey; version: string; acceptedAt: string /* ISO */ }`.
- `legalStatusSchema = z.object({ accepted: z.boolean(), documents: z.array(z.object({ document: legalDocumentKeySchema, requiredVersion: z.string(), acceptedVersion: z.string().nullable(), acceptedAt: z.iso.datetime().nullable() })) })`, `type LegalStatus`.
- `legalStatus(acceptances: readonly LegalAcceptanceRecord[], registry: readonly LegalDocumentVersion[] = LEGAL_DOCUMENTS): LegalStatus` — per registry entry: the row with the latest `acceptedAt` gives `acceptedVersion`/`acceptedAt` (null when none); the entry is satisfied when `requireReacceptance ? rows.some(r => r.version === entry.version) : rows.length > 0`; `accepted` = every entry satisfied. Order of `documents` = registry order.

**Interfaces — produces (web):**
- `slugs.ts`: `LEGAL_SLUGS = { TERMS: 'terms', PRIVACY: 'privacy' } as const`, `type LegalSlug`, `legalDocumentFromSlug(slug: string): LegalDocumentKey | null`, `legalPath(document: LegalDocumentKey): `/legal/${LegalSlug}``.
- `documents.ts` (server only: a top comment as in `api/server.ts`; imported from server components only): `LEGAL_CONTENT_DIR = path.join(process.cwd(), 'content/legal')`; `legalDocumentFile(document, locale): string` → `${LEGAL_CONTENT_DIR}/${slug}.${locale}.${version}.md`; `loadLegalDocument(document: LegalDocumentKey, locale: Locale): Promise<{ meta: LegalDocumentVersion; html: string }>` — reads the file, `marked.parse(markdown, { gfm: true, async: false })`.

- [ ] **Step 1: rule 14 check of `marked`** — record in the commit message: version, licence, dependency count (0), last release date. Add it to `apps/web/package.json` `dependencies` with an exact version; `pnpm install`.
- [ ] **Step 2: Failing tests** (`packages/contracts/src/legal.test.ts`):
  - `LEGAL_DOCUMENTS` has exactly one entry per `legalDocumentKeySchema.options` value, every `version` matches `LEGAL_VERSION_PATTERN`, every `effectiveDate` matches `/^\d{4}-\d{2}-\d{2}$/`;
  - `legalStatus([])` → `accepted: false`, two documents with `acceptedVersion: null`;
  - accepted `TERMS v1` only → `accepted: false`, `documents[0].acceptedVersion === 'v1'`;
  - both accepted → `accepted: true`, `acceptedAt` equals the input;
  - with a registry entry `requireReacceptance: true, version: 'v2'` (pass a custom registry through a second parameter `registry = LEGAL_DOCUMENTS`) and an acceptance of `v1` only → that document unsatisfied; with `v1` and `v2` rows → satisfied and `acceptedVersion` is the later row's version;
  - `legalStatusSchema.parse(legalStatus(...))` round-trips.
- [ ] **Step 3: Run** `pnpm --filter @stepler/contracts test` → FAIL (module not found).
- [ ] **Step 4: Implement `legal.ts`** per the Interfaces block; export from `index.ts`.
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Failing tests** (`apps/web/src/legal/documents.test.ts`, Vitest node):
  - for every `LEGAL_DOCUMENTS` entry × `LOCALES`: `legalDocumentFile` exists, is ≥ 100 bytes, contains no line starting with `# ` (the page owns the h1), contains no `<` followed by a letter or `/` (no raw HTML), and when `draft` is true its first non-empty line starts with `> ` and contains «Чернетка» (uk) / `Draft` (en);
  - `loadLegalDocument('TERMS', 'uk')` returns `html` containing `<h2` and `meta.version === 'v1'`;
  - `legalDocumentFromSlug('terms') === 'TERMS'`, `legalDocumentFromSlug('x') === null`, `legalPath('PRIVACY') === '/legal/privacy'`.
- [ ] **Step 7: Run** `pnpm --filter @stepler/web test -- documents` → FAIL.
- [ ] **Step 8: Write the four Markdown files** with exactly the structural template from "Deliberate choices" (blockquote draft line, three neutral numbered `##` sections, one bullet each) and implement `slugs.ts`, `documents.ts`.
- [ ] **Step 9: Run** → PASS; `pnpm --filter @stepler/web typecheck lint`.
- [ ] **Step 10: Commit** `feat(legal): document registry, placeholder texts and the Markdown loader`.

### Task 2: Public legal pages and the production readiness check

**Files:**
- Create: `apps/web/src/app/legal/[document]/page.tsx`, `apps/web/src/legal/legal-article.tsx` (`DraftBanner`, `LegalMeta`, `ContactBlock`, `LegalArticle`)
- Create: `apps/web/src/legal/readiness.ts`, `apps/web/src/legal/readiness.test.ts`, `apps/web/src/instrumentation.ts`
- Modify: `apps/web/src/env.ts` (+ `LEGAL_CONTACT_EMAIL`, `LEGAL_ALLOW_DRAFT`), `apps/web/src/env.test.ts` if present (else the readiness test covers parsing), `apps/web/.env.example`, `apps/web/next.config.ts` (`outputFileTracingIncludes`), `apps/web/src/app/globals.css` (`@utility legal-prose`), `apps/web/messages/uk.json` + `en.json` (namespace `legal`), `turbo.json` (`dev`, `e2e` `passThroughEnv`), `e2e/playwright.config.ts` (web `webServer.env`), `docker/scripts/verify-images.sh`, `render.yaml` (web service), `docs/development/README.md` (env table)

**Interfaces — consumes:** Task 1 (`loadLegalDocument`, `legalDocumentFromSlug`, `LEGAL_DOCUMENTS`).
**Interfaces — produces:**
- `getWebEnv()` gains `LEGAL_CONTACT_EMAIL: string | undefined` (`z.email().optional()`) and `LEGAL_ALLOW_DRAFT: boolean` (`'true' | 'false'`, default `false`).
- `assertLegalReady(input: { documents: readonly LegalDocumentVersion[]; allowDraft: boolean; contactEmail: string | undefined }): void` — throws `Error` whose message lists each problem (`"TERMS v1 is a draft"`, `"LEGAL_CONTACT_EMAIL is not set"`) when `allowDraft` is false; never throws when it is true.
- Route `/legal/[document]`: `generateMetadata` → `title: t('legal.<slug>.title')`, `description: t('legal.<slug>.description')` (indexable); unknown slug → `notFound()`.
- Messages `legal.*`: `terms.title` «Умови використання», `privacy.title` «Політика конфіденційності», `*.description`, `draftBanner` «Чернетка — текст буде замінено», `meta` «Версія {version} · діє з {date}», `contact.title` «Контакти», `contact.text` «З питань персональних даних і скарг на вміст пишіть на {email}», `navLabel` «Правові документи» (en equivalents; the `uk` catalog rules apply).

- [ ] **Step 1: Failing tests** (`readiness.test.ts`): a draft with `allowDraft: false` throws naming the document and version; no drafts but `contactEmail: undefined` throws naming the variable; both problems → one error listing both; `allowDraft: true` never throws; `loadWebEnv` rejects `LEGAL_CONTACT_EMAIL=not-an-email`, parses `LEGAL_ALLOW_DRAFT=true`, defaults it to `false`.
- [ ] **Step 2: Run** `pnpm --filter @stepler/web test -- readiness` → FAIL.
- [ ] **Step 3: Implement** `env.ts` fields and `readiness.ts`; `instrumentation.ts`: `export async function register() { if (process.env.NEXT_RUNTIME !== 'nodejs') return; const env = getWebEnv(); assertLegalReady({ documents: LEGAL_DOCUMENTS, allowDraft: env.LEGAL_ALLOW_DRAFT || process.env.NODE_ENV === 'development', contactEmail: env.LEGAL_CONTACT_EMAIL }); }` — if Next.js logs instead of exiting on a throw here (verify in Step 7), log the message and `process.exit(1)`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Design pass, then the page.** `page.tsx` (RSC): `SiteHeader` with `LanguageSwitch variant="header"` (`print:hidden`), `main.stepler-container` → `LegalArticle`: `h1` (`type-h1`), `LegalMeta` (`<p>` with `<time dateTime={effectiveDate}>`, date through `getFormatter().dateTime(…, 'short')`), `DraftBanner` when `meta.draft`, `<article className="legal-prose" dangerouslySetInnerHTML={{ __html: html }} />` at `max-w-[68ch]`, `ContactBlock` when `LEGAL_CONTACT_EMAIL` is set, `SiteFooter` (`print:hidden`). `@utility legal-prose` in `globals.css` styles `h2` (`type-h2`, top margin), `h3`, `p`, `ul/ol` (outside markers, 1.25rem indent), `li`, `a` (underline, `--link`, focus ring), `blockquote` (the draft line: muted, left border), `strong`. `next.config.ts`: `outputFileTracingIncludes: { '/legal/[document]': ['./content/legal/**/*'] }`.
- [ ] **Step 6: Wire the env everywhere** (Global Constraints → Env): `.env.example` (`LEGAL_CONTACT_EMAIL=privacy@example.com`, `LEGAL_ALLOW_DRAFT=true` with a comment "never in production"), `turbo.json` `dev` + `e2e`, `playwright.config.ts` web env (`LEGAL_ALLOW_DRAFT: 'true'`, `LEGAL_CONTACT_EMAIL: 'privacy@stepler.test'`), `verify-images.sh` (`-e LEGAL_ALLOW_DRAFT=true` on the web `docker run`; add `expect_exit_on_bad_env "$WEB_IMAGE" -e API_INTERNAL_URL=http://x:1` **without** the flag to prove the production refusal; add `curl -fsS http://127.0.0.1:3199/legal/terms | grep -q 'Чернетка'` after the proxy check), `render.yaml` web `envVars` (`LEGAL_ALLOW_DRAFT: value: 'true'`, `LEGAL_CONTACT_EMAIL: sync: false`), README rows for both variables.
- [ ] **Step 7: Verify the standalone server.** `pnpm --filter @stepler/web build`; start `.next/standalone/apps/web/server.js` on a free port with `API_INTERNAL_URL` set and **no** `LEGAL_ALLOW_DRAFT` → the process exits non-zero printing the two problems; start it again with `LEGAL_ALLOW_DRAFT=true` → `curl /legal/terms` returns 200 with the h1 and the banner, `/legal/privacy` with `Accept-Language: en` returns English, `/legal/nope` returns 404. Fix `instrumentation.ts` per Step 3 if the first start did not exit.
- [ ] **Step 8: Screenshots** per Global Constraints (incl. print preview) → `$TMPDIR/stepler-legal-screens/F1/`.
- [ ] **Step 9: Run** `pnpm --filter @stepler/web test typecheck lint` → PASS. **Commit** `feat(web): public legal pages with draft banner, contact block and the readiness check`.

### Task 3: Footer links, admin sidebar links and the guest notice

**Files:**
- Create: `apps/web/src/legal/legal-links.tsx` (`LegalLinks`)
- Modify: `apps/web/src/components/site-footer.tsx`, `apps/web/src/app/g/[token]/page.tsx` (+ `SiteFooter`), `apps/web/src/app/app/admin-nav.tsx` (links under the sections), `apps/web/src/guest/guest-page.tsx` (`ContributeActions` only), `apps/web/messages/uk.json` + `en.json` (`guest.legalNotice` at the end of `guest`; `app.nav.legal` if a label is needed)
- Create: `apps/web/src/guest/legal-notice.tsx` (`GuestLegalNotice`)

**Interfaces — consumes:** Task 1 (`legalPath`).
**Interfaces — produces:**
- `LegalLinks({ className?, newTab?: boolean, variant?: 'footer' | 'nav' })` — the two links («Умови використання», «Політика конфіденційності») from `legal.terms.title` / `legal.privacy.title`, as a `<nav aria-label={t('legal.navLabel')}>`; `newTab` adds `target="_blank" rel="noopener noreferrer"`; rows ≥ 44 px in the `nav` variant.
- `GuestLegalNotice({ className? })` — `t.rich('guest.legalNotice', { terms: chunks => <a …>, privacy: chunks => <a …> })` with `newTab` links; placeholder text (uk): «Додаючи вміст, ви погоджуєтеся з <terms>Умовами використання</terms> і підтверджуєте, що ознайомилися з <privacy>Політикою конфіденційності</privacy>.» (en: "By adding content you agree to the <terms>Terms of Service</terms> and acknowledge the <privacy>Privacy Policy</privacy>."); a code comment names the key as lawyer-replaceable copy.

- [ ] **Step 1: Design pass**, then implement `LegalLinks`, `GuestLegalNotice`; `SiteFooter` renders copyright + `LegalLinks variant="footer"` (wraps on phones); the guest route page adds `<SiteFooter />` after `main` (keep room above the fixed phone dock: the footer must be reachable by scrolling, not hidden under it); `AdminNav` renders `LegalLinks variant="nav"` under the `ul` (`mt-auto`, `hidden` when `collapsed`); `ContributeActions` renders `<GuestLegalNotice className="pt-1" />` after the buttons in both branches (text-only and files).
- [ ] **Step 2: Run** `pnpm --filter @stepler/web test typecheck lint` → PASS (the `uk` catalog rules, `jsx-no-literals`). The journeys for these links follow in Task 4.
- [ ] **Step 3: Screenshots**: `/login` footer, `/g/{token}` on 360 (dock with the notice) and 1440 (side sheet), the admin sidebar expanded and collapsed, light and dark → `$TMPDIR/stepler-legal-screens/F1/`.
- [ ] **Step 4: Commit** `feat(web): legal links in footers and the admin sidebar; guest terms notice`.

### Task 4: Journeys, runbook, docs and PR F1

**Files:**
- Create: `e2e/tests/legal.spec.ts`
- Modify: `e2e/package.json` (devDependency `@stepler/contracts: workspace:*` to read `LEGAL_DOCUMENTS` in the test)
- Create: `docs/legal/README.md`
- Modify: `BOOTSTRAP.md` (slice 10 status: F1 shipped, acceptance in F2; amend [C20] with "real texts, `draft: false`"), `docs/product/mvp.md` (+ «Legal pages (Terms, Privacy, uk/en, versioned) — built in slice 10 (PR F1)»), `docs/architecture/mvp-architecture-spec.md` §15 (pages, registry, contact e-mail, readiness check — mark acceptance "PR F2"), `docs/design/DESIGN-SYSTEM.md` (new §6.11 «Юридичні сторінки»: frame, `legal-prose`, banner, print), `docs/architecture/decisions/0013-abuse-reporting-and-operator.md` (the public contact is `LEGAL_CONTACT_EMAIL`)

- [ ] **Step 1: Failing journeys** (`legal.spec.ts`, untagged so all three projects run them):
  - `/legal/terms` shows the h1 «Умови використання», the meta line with `v1` and the draft banner (`role="note"`) exactly when `currentLegalVersion('TERMS').draft`; `/legal/privacy` likewise; a context with `locale: 'en-US'` shows "Terms of Service"; `/legal/unknown` → 404;
  - **Review Focus 4:** a context with `javaScriptEnabled: false` renders the text and the footer links navigate; at 320 px `horizontalOverflow(page) === 0`; headings are `getByRole('heading', { level: 2 })` ≥ 3;
  - `/login` footer has both links and they land on the pages;
  - **Review Focus 5:** a guest opens a live link, taps «Умови використання» in the notice → `context.waitForEvent('page')` resolves to `/legal/terms`, `await newPage.evaluate(() => document.referrer) === ''` and `window.opener === null`; the guest page still shows the dock.
- [ ] **Step 2: Run** `pnpm e2e -- --grep legal` → FAIL where expected (or fix what the journeys reveal).
- [ ] **Step 3: Write `docs/legal/README.md`** (runbook): where the files live; the version/slug/locale file naming; how to publish a new version (new `.md` pair, registry entry: `version`, `effectiveDate`, `draft: false`, `requireReacceptance` — a product/legal decision; one PR, one commit); what the web and API do with it (banner off, meta line, acceptance records the new version, re-acceptance only when flagged); `LEGAL_CONTACT_EMAIL` and `LEGAL_ALLOW_DRAFT` (staging yes, production never); what to tell users on a bump (a plain-language note on the account page is enough while `requireReacceptance` is false — not built, see F2 account block); the checks that enforce all this (`documents.test.ts`, readiness check, `verify-images.sh`).
- [ ] **Step 4: Docs** listed above; design review feedback batched into one commit; `pnpm lint typecheck test build` and `pnpm e2e` green; `bash docker/scripts/verify-images.sh` green.
- [ ] **Step 5: Commit** `test(e2e): legal pages, footer links and the guest notice; docs: legal runbook` and open PR F1 against `dev` (body ends with the attribution line from the session's system reminder).

---

## PR F2 — Acceptance recording and the gate

### Task 5: Contracts for acceptance

**Files:**
- Modify: `packages/contracts/src/legal.ts` (+ request schema), `packages/contracts/src/legal.test.ts`, `packages/contracts/src/auth.ts` (`meResponseSchema.legal`), `packages/contracts/src/auth.test.ts`, `packages/contracts/src/errors.ts` (+ codes), `packages/contracts/src/index.ts`
- Modify: `apps/web/messages/uk.json` + `en.json` (`errors.LEGAL_ACCEPTANCE_REQUIRED`, `errors.LEGAL_VERSION_OUTDATED`)

**Interfaces — produces:**
- `legalVersionsSchema = z.object({ terms: z.string().regex(LEGAL_VERSION_PATTERN), privacy: z.string().regex(LEGAL_VERSION_PATTERN) }).strict()`, `type LegalVersions`; `currentLegalVersions(): LegalVersions` (from the registry); `isCurrentLegalVersions(v: LegalVersions): boolean`.
- `meResponseSchema` gains `legal: legalStatusSchema`; `type MeResponse` follows.
- `authMethodsResponseSchema` gains `legal: legalVersionsSchema` — the current versions the card must send back.
- `magicLinkRequestSchema` gains **required** `legal: legalVersionsSchema` (the checkbox's server-side form).
- `legalAcceptanceRequestSchema = z.object({ acceptances: z.array(z.object({ document: legalDocumentKeySchema, version: z.string().regex(LEGAL_VERSION_PATTERN) }).strict()).min(1).max(2) }).strict()`, `type LegalAcceptanceRequest` (the fallback endpoint).
- `ERROR_CODES` += `'LEGAL_ACCEPTANCE_REQUIRED'` (403 on gated routes; also the `/login?error=` code when Google start lacks the versions), `'LEGAL_VERSION_OUTDATED'` (400).
- Messages: `errors.LEGAL_ACCEPTANCE_REQUIRED` «Щоб продовжити, прийміть Умови використання та Політику конфіденційності.», `errors.LEGAL_VERSION_OUTDATED` «Документи оновилися. Перегляньте їх і прийміть ще раз.» (+ en).

- [ ] **Step 1: Failing tests:** `legalVersionsSchema` accepts `{terms:'v1',privacy:'v1'}`, rejects a missing key, `terms: '1'`, `terms: '<script>'`, an extra key; `currentLegalVersions()` equals the registry's versions and `isCurrentLegalVersions` is true for it and false for `{terms:'v9',privacy:'v1'}`; `magicLinkRequestSchema` now rejects a body without `legal` (update `auth.test.ts` fixtures); `authMethodsResponseSchema` requires `legal`; `legalAcceptanceRequestSchema` accepts `{acceptances:[{document:'TERMS',version:'v1'}]}`, rejects an empty array, three items, `version: '1'`, an unknown document, an extra key; `meResponseSchema` requires `legal` and parses the object `legalStatus([])` returns; the web catalog test (`ukrainian-copy.test.ts` + the existing "every error code has a message" assertion, if present in `apps/web/src/errors`) covers the new codes.
- [ ] **Step 2: Run** `pnpm --filter @stepler/contracts test` → FAIL. **Implement.** **Run** → PASS; `pnpm --filter @stepler/web test` (catalog) → PASS. (`apps/api` and `apps/web` typecheck will fail until Tasks 6–8 adapt them; that is expected within PR F2 — do not commit broken `dev`.)
- [ ] **Step 3: Commit** `feat(contracts): legal versions at sign-in, acceptance request, me.legal and error codes`.

### Task 6: `LegalAcceptance` table, API endpoint and the gate

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (enum `LegalDocument { TERMS PRIVACY }`, model `LegalAcceptance`, `User.legalAcceptances`)
- Create: `apps/api/prisma/migrations/<timestamp>_legal_acceptances/migration.sql` (`--create-only`, then append `ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_version_format" CHECK ("version" ~ '^v[1-9][0-9]{0,3}$');`)
- Create: `apps/api/src/legal/legal.module.ts`, `apps/api/src/legal/legal.service.ts`, `apps/api/src/auth/skip-legal-gate.decorator.ts`, `apps/api/src/users/legal-acceptances.controller.ts`
- Modify: `apps/api/src/auth/session.service.ts` (`ResolvedSession.legalAccepted`), `apps/api/src/auth/auth.guard.ts`, `apps/api/src/users/users.service.ts` (`me`/`updateMe` include `legal`), `apps/api/src/users/me.controller.ts` (`@SkipLegalGate()` on `me` and `update`), `apps/api/src/users/users.module.ts` (import `LegalModule`), `apps/api/src/app.module.ts` if modules are listed there, `apps/api/openapi.json`
- Modify: `apps/api/test/support/sessions.ts` (`signInAs(app, prisma, email, verified = true, legal = true)`), `apps/api/test/auth-core.e2e.spec.ts` (the `toEqual` body gains `legal`), `apps/api/test/magic-link.e2e.spec.ts`, `apps/api/test/google.e2e.spec.ts`
- Create: `apps/api/test/legal-acceptances.e2e.spec.ts`

**Interfaces — consumes:** Task 5; `legalStatus`, `currentLegalVersion`, `LEGAL_DOCUMENTS` from contracts; `RequestId`, `CurrentPrincipal`, `AppError`.
**Interfaces — produces:**
- Prisma `LegalAcceptance { id uuidv7; userId → User (cascade); document LegalDocument; version String; acceptedAt DateTime @default(now()) @db.Timestamptz(3); requestId String?; @@unique([userId, document, version]) }`.
- `ResolvedSession.legalAccepted: boolean` — `resolve()` adds `legalAcceptances: { select: { document, version, acceptedAt } }` to the existing `user` select and computes `legalStatus(rows).accepted`.
- `SKIP_LEGAL_GATE` metadata key + `SkipLegalGate()` decorator (`apps/api/src/auth/skip-legal-gate.decorator.ts`).
- `AuthGuard.canActivate`: after `req.principal` is set, `if (!session.legalAccepted && !skipLegalGate) throw new AppError('LEGAL_ACCEPTANCE_REQUIRED', 403)`.
- `LegalService.statusFor(userId: string): Promise<LegalStatus>`; `LegalService.recordAcceptance(tx: Prisma.TransactionClient, userId: string, versions: LegalVersions, requestId: string | undefined): Promise<void>` — writes a row per document whose version is current **now** (`isCurrentLegalVersions` per document; a stale one is skipped silently) with `createMany({ data, skipDuplicates: true })`; used by Task 7's sign-in flows too; `LegalService.accept(userId, body: LegalAcceptanceRequest, requestId): Promise<void>` (fallback endpoint) — every `version` must equal `currentLegalVersion(document).version`, else `400 LEGAL_VERSION_OUTDATED` before any write; then `recordAcceptance` in its own transaction.
- `UsersService.me` / `updateMe` return `{ ...user, isOperator, legal: await this.legal.statusFor(userId) }`.
- Route `POST /me/legal-acceptances` (`@SkipLegalGate()`, `@ApiTags('Me')`, `@ApiCookieAuth`) → `200 MeResponse`; documented errors `401`, `400 VALIDATION_FAILED`, `400 LEGAL_VERSION_OUTDATED`.
- `signInAs(..., legal = true)` inserts one acceptance per `LEGAL_DOCUMENTS` entry at its current version.

- [ ] **Step 1: Migration.** Edit the schema; `pnpm --filter @stepler/api db:migrate -- --create-only --name legal_acceptances` against your own local database (never the owner's); append the CHECK; `pnpm db:migrate`; `pnpm db:check` → clean.
- [ ] **Step 2: Failing tests** (`legal-acceptances.e2e.spec.ts`):
  - no cookie → `401 UNAUTHENTICATED` on `GET /me` and `POST /me/legal-acceptances`;
  - `signInAs(…, true, false)` (no acceptances): `GET /me` → `legal.accepted === false`, two `documents` with `requiredVersion` from the registry and `acceptedVersion: null`;
  - **Review Focus 1:** the same user gets `403 LEGAL_ACCEPTANCE_REQUIRED` on `GET /collections`, `POST /collections`, `GET /me/usage`, `GET /collections/<uuid>/content`; an `OPERATOR_EMAILS` user without acceptances gets `403` on `GET /collections` too (operators are users; the slice 9 operator routes inherit the gate); `PATCH /me {locale:'en'}` → `200`; `POST /auth/logout` → `204`; a public guest route (`POST /guest/links/resolve` with a bad token) answers its own `404`, not `403`;
  - `POST /me/legal-acceptances` with both current versions → `200`, body is `MeResponse` with `legal.accepted: true`, each `acceptedAt` an ISO string; the two rows have `requestId` equal to the `x-request-id` header sent; the row has no `ip` column (`Object.keys(row)` equals the expected set);
  - **Review Focus 3:** the same request again → `200`, still two rows; `Promise.all` of two identical requests → both `200`, two rows;
  - **Review Focus 2 (b):** `version: 'v9'` for `TERMS` → `400 LEGAL_VERSION_OUTDATED`, zero rows; a mixed body (one current, one outdated) → `400`, zero rows;
  - partial: `TERMS` only → `accepted: false`, `documents[0].acceptedVersion === 'v1'`; then `PRIVACY` → `accepted: true`; after that `GET /collections` → `200`;
  - validation: `[]`, three items, `version: '1'`, `document: 'COOKIES'` → `400 VALIDATION_FAILED`;
  - a `DELETE` of the user cascades the rows (direct Prisma assertion).
- [ ] **Step 3: Run** `pnpm --filter @stepler/api test` → the new tests FAIL, `auth-core` fails on the body shape. (The magic-link and Google suites also fail on the new required `legal` field from Task 5 — Task 7 owns them; temporarily they may send `legal: currentLegalVersions()` so this task's run is meaningful.)
- [ ] **Step 4: Implement** per the Interfaces block; update `signInAs` and `auth-core.e2e.spec.ts`; `pnpm openapi:write`.
- [ ] **Step 5: Run** `pnpm --filter @stepler/api test typecheck lint` → PASS (every existing suite still green because `signInAs` accepts by default).
- [ ] **Step 6: Commit** `feat(api): legal acceptances, me.legal and the acceptance gate`.

### Task 7: Acceptance transport at sign-in (magic link and Google)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`MagicLinkToken.legalTermsVersion String?`, `legalPrivacyVersion String?`), new migration `<timestamp>_magic_link_legal_versions` (`--create-only`; append `ALTER TABLE "MagicLinkToken" ADD CONSTRAINT "MagicLinkToken_legal_versions_format" CHECK (("legalTermsVersion" IS NULL OR "legalTermsVersion" ~ '^v[1-9][0-9]{0,3}$') AND ("legalPrivacyVersion" IS NULL OR "legalPrivacyVersion" ~ '^v[1-9][0-9]{0,3}$'));`)
- Modify: `apps/api/src/auth/auth.controller.ts` (`methods()` adds `legal: currentLegalVersions()`), `apps/api/src/auth/magic-link.service.ts`, `apps/api/src/auth/magic-link.controller.ts` (`@RequestId()` on verify), `apps/api/src/auth/google/oauth-cookie.ts` (`transactionSchema` + `legal: legalVersionsSchema`), `apps/api/src/auth/google/google.controller.ts`, `apps/api/src/auth/google/google-sign-in.service.ts`, `apps/api/src/auth/auth.module.ts` (import `LegalModule`), `apps/api/openapi.json`
- Modify: `apps/api/test/magic-link.e2e.spec.ts`, `apps/api/test/google.e2e.spec.ts`, `apps/api/test/auth-core.e2e.spec.ts` (`/auth/methods` body)

**Interfaces — consumes:** Task 5 (`legalVersionsSchema`, `currentLegalVersions`, `isCurrentLegalVersions`, `magicLinkRequestSchema.legal`, `authMethodsResponseSchema.legal`), Task 6 (`LegalService.recordAcceptance`), `oauth-cookie.ts` (`encodeTransaction`/`decodeTransaction`: HMAC-SHA256 with the HKDF key `st_oauth`, `state` compared in constant time — the versions ride inside that signed payload, so they are as tamper-proof as `codeVerifier` and `returnTo`).
**Interfaces — produces:**
- `GET /auth/methods` → `{ magicLink, google, turnstileSiteKey, legal: { terms, privacy } }`.
- `MagicLinkService.request(input, ip)`: after Turnstile, `if (!isCurrentLegalVersions(input.legal)) throw new AppError('LEGAL_VERSION_OUTDATED', 400)` (before the IP count and any row); the token row stores `legalTermsVersion`/`legalPrivacyVersion`. A body without `legal` never reaches the service (`400 VALIDATION_FAILED` from the schema).
- `MagicLinkService.verify(token, requestId): Promise<string>` — the `UPDATE … RETURNING` also returns both version columns; `signInByEmail` runs `recordAcceptance(tx, user.id, versions, requestId)` **inside the existing `$transaction`** with the `emailVerifiedAt` update and the `EMAIL` account upsert, when both columns are non-null (legacy rows: nothing recorded).
- `GoogleController.start(returnTo, terms, privacy)`: `legalVersionsSchema.safeParse({ terms, privacy })` fails → `302 ${APP_ORIGIN}/login?error=LEGAL_ACCEPTANCE_REQUIRED` with **no** `st_oauth` cookie; not current → `…?error=LEGAL_VERSION_OUTDATED`; else the transaction `{ state, codeVerifier, returnTo, legal }`.
- `GoogleSignInService.signIn(claims, legal: LegalVersions, requestId): Promise<string>` — `recordAcceptance` inside the existing `$transaction` with the account upsert (both the linked-`sub` branch and the new/linked-by-email branch).
- `safeReturnTo` is unchanged; the `/login?error=` set grows by the two codes (the web maps them in Task 8).

- [ ] **Step 1: Migration** (as Task 6 Step 1, own local database); `pnpm db:check` clean.
- [ ] **Step 2: Failing tests.** `magic-link.e2e.spec.ts`: a request without `legal` → `400 VALIDATION_FAILED`, no token row, no mail (`mailpit` empty); `legal.terms: 'v9'` → `400 LEGAL_VERSION_OUTDATED`, no row, **and the per-IP counter is not consumed** (mirror the Turnstile-failure test); `legal.terms: '<script>'` → `400 VALIDATION_FAILED`; the happy path for a **new** address: the token row holds both versions; after verify `GET /me` → `legal.accepted: true`, two rows with `requestId` equal to the `x-request-id` sent on **verify**; **Review Focus 3:** an **existing** accepted user signs in again → still two rows; **Review Focus 2 (b):** a token row inserted directly with `legalTermsVersion: 'v0'`-style stale values is impossible (CHECK) — instead insert a row with both columns `NULL` (a pre-slice link) → verify succeeds, `GET /me` → `accepted: false`, `GET /collections` → `403 LEGAL_ACCEPTANCE_REQUIRED`. `google.e2e.spec.ts`: `/start` without `terms`/`privacy` → `302` to `/login?error=LEGAL_ACCEPTANCE_REQUIRED` and **no** `Set-Cookie: st_oauth`; with `terms=v9` → `…LEGAL_VERSION_OUTDATED`; with current versions → the cookie's payload (decode the base64url part) contains `legal`; a tampered payload (edit `legal` in the cookie, keep the signature) → `OAUTH_FAILED` (extends the existing "tampered st_oauth" test); callback for a new sub → two rows, `GET /me` accepted; callback for an existing accepted user → still two rows; `/auth/methods` → `legal` equals `currentLegalVersions()`. `auth-core`: `/auth/methods` body.
- [ ] **Step 3: Run** `pnpm --filter @stepler/api test` → FAIL. **Implement** per the Interfaces block; `pnpm openapi:write`.
- [ ] **Step 4: Run** `pnpm --filter @stepler/api test typecheck lint` → PASS.
- [ ] **Step 5: Commit** `feat(api): record legal acceptance at sign-in (magic link token, Google transaction)`.

### Task 8: Sign-in card checkbox, the web transport and the `/accept-terms` fallback

**Files:**
- Modify: `apps/web/src/app/login/login-form.tsx` (checkbox, disabled buttons, `legal` in the request body and in the Google `href`), `apps/web/src/app/login/sign-in-landing.tsx` (`CALLBACK_ERRORS` + `LEGAL_ACCEPTANCE_REQUIRED`, `LEGAL_VERSION_OUTDATED`; passes `methods.legal`), `apps/web/src/api/server.ts` (`fetchAuthMethods` parses `legal`), `apps/web/messages/uk.json` + `en.json` (`login.legalCheckbox`, `login.legalHint`; namespace `acceptTerms`)
- Create: `apps/web/src/app/accept-terms/page.tsx`, `apps/web/src/app/accept-terms/accept-terms-panel.tsx`
- Modify: `apps/web/src/app/app/layout.tsx`, `apps/web/src/app/app/app-shell.tsx`, `apps/web/src/api/me.ts` (`acceptLegal(body): Promise<MeResponse>`)
- Modify: `e2e/support/auth.ts` (`requestLink` ticks the checkbox; `signIn` keeps `acceptTermsIfAsked` for the fallback; `SIGN_IN_UK.legal`, `ACCEPT_TERMS_UK`), `e2e/tests/auth.spec.ts` (keyboard-only test includes the checkbox), `e2e/tests/legal.spec.ts` (+ sign-in journeys)

**Interfaces — consumes:** Task 5/6/7 (`MeResponse.legal`, `authMethodsResponseSchema.legal`, `magicLinkRequestSchema.legal`, `POST /me/legal-acceptances`, the `/login?error=` codes), Task 1 (`legalPath`), `CenteredPage`, `Checkbox` + `Label` from `@stepler/ui`, `getSessionUser()`.
**Interfaces — produces:**
- `LoginForm({ turnstileSiteKey, googleEnabled, legal: LegalVersions, initialError })`: a `Checkbox` in a `Label` row (≥ 44 px) above the submit button, text `login.legalCheckbox` «Я приймаю <terms>Умови використання</terms> та <privacy>Політику конфіденційності</privacy>» (`t.rich`, links `target="_blank" rel="noopener noreferrer"`; a code comment marks the key as lawyer-replaceable); `legalAccepted` state; the submit `Button` is disabled while unchecked **or** Turnstile is pending (label order: `login.legalPending` «Поставте позначку, щоб продовжити» wins over `turnstilePending`); the Google action is a disabled `Button` while unchecked and the anchor `href={`/api/v1/auth/google/start?terms=${legal.terms}&privacy=${legal.privacy}`}` once checked; both carry `aria-describedby="legal-hint"` (`login.legalHint`, sr-only when checked). The request body gains `legal`. The checkbox state is not persisted (a new visit asks again).
- `callbackError` accepts `'LEGAL_ACCEPTANCE_REQUIRED' | 'LEGAL_VERSION_OUTDATED'` too; the latter also triggers `router.refresh()` so `fetchAuthMethods` brings the new versions.
- `/accept-terms` (server page, `robots: { index: false }`): `getSessionUser()` → `null` → `redirect('/login')`; a `MeResponse` with `legal.accepted` → `redirect('/app')`; otherwise (or `'unavailable'`) render `CenteredPage` → `AcceptTermsPanel`.
- `AcceptTermsPanel` (client, fallback): reads `me` (`ME_QUERY_KEY`), explains why it is shown (`acceptTerms.lead`), lists the required documents as new-tab links with «Версія {version} · діє з {date}», one `Checkbox` in a `Label` row (≥ 44 px) with `acceptTerms.checkbox` (the same text as `login.legalCheckbox`), primary «Прийняти і продовжити», ghost «Вийти» (same logout mutation as `AccountBlock`). Submit without the box → inline error `acceptTerms.mustCheck` «Поставте позначку, щоб продовжити» (`role="alert"`, focus to the checkbox); with it → `acceptLegal({ acceptances: me.legal.documents.map(d => ({ document: d.document, version: d.requiredVersion })) })` → `queryClient.setQueryData(ME_QUERY_KEY, data)` → `router.replace('/app')`; `400 LEGAL_VERSION_OUTDATED` → `invalidateQueries(ME_QUERY_KEY)`, show `errors.LEGAL_VERSION_OUTDATED`, keep the box unchecked (Review Focus 2); other errors → `Alert` with `errorMessageKey`.
- `/app/layout.tsx`: `const user = await getSessionUser(); if (user === null) redirect('/login'); if (user !== 'unavailable' && !user.legal.accepted) redirect('/accept-terms');`.
- `AppShell`: when `me.data?.legal.accepted === false` → `router.replace('/accept-terms')` (covers a forced re-acceptance arriving while the app is open).
- Messages `acceptTerms.*`: `pageTitle` «Прийняття умов», `title` «Прийміть умови, щоб продовжити», `lead` «Для вашого акаунта ще немає підтвердження Умов використання та Політики конфіденційності — або документи оновилися.», `checkbox`, `submit` «Прийняти і продовжити», `submitting` «Зберігаємо…», `mustCheck`, `logout` «Вийти», `documentMeta` «Версія {version} · діє з {date}» (+ en).
- `e2e/support/auth.ts`: `requestLink` checks `SIGN_IN_UK.legal` («Я приймаю Умови використання та Політику конфіденційності») before `submit`; `signIn` keeps `await page.waitForURL(/\/(app|accept-terms)$/)` and `acceptTermsIfAsked(page)` (the fallback must not break a journey if it ever appears).

- [ ] **Step 1: Failing journeys** (`legal.spec.ts`, plus the `auth.spec.ts` keyboard test):
  - the card: both buttons are disabled until the box is checked (`toBeDisabled`); the two links beside it open in new tabs and the typed e-mail survives (**Review Focus 5**); after checking, a **new** e-mail signs in via magic link and lands on `/app` directly — **no** interstitial; `page.request.get('/api/v1/me')` → `legal.accepted === true`; «Акаунт» → «Правові документи» shows «Прийнято» twice (block from Task 9; assert in Task 9);
  - the fallback page: a signed-out visit to `/accept-terms` → `/login`; a signed-in accepted user visiting `/accept-terms` → `/app` (a user **without** rows cannot be produced through the UI any more, so the fallback's accept flow and its `400 LEGAL_VERSION_OUTDATED` reaction are covered by the API tests in Tasks 6–7 and by a Vitest test of the panel's pure reducer if one is extracted; otherwise by the owner's staging check: pre-slice accounts land on `/accept-terms` once);
  - a Google start without the versions (`page.goto('/api/v1/auth/google/start')` when Google is configured in e2e — if it is not, skip with a comment) → `/login?error=LEGAL_ACCEPTANCE_REQUIRED` shows the mapped message;
  - keyboard only (`auth.spec.ts` existing test): Tab reaches the checkbox before the submit button, Space checks it, the button becomes enabled (also on `isMobile`).
- [ ] **Step 2: Run** `pnpm e2e -- --grep "legal|keyboard"` → FAIL.
- [ ] **Step 3: Design pass** (the checkbox sits between Turnstile and the submit; the card must still fit a 320px panel with the Ukrainian label wrapping), then implement the card, `fetchAuthMethods`, the error mapping, the fallback page and panel, the redirects, `acceptLegal`, the messages and the e2e helpers.
- [ ] **Step 4: Run** `pnpm --filter @stepler/web test typecheck lint` and `pnpm e2e` (the whole suite: every journey that signs in goes through `requestLink`) → PASS.
- [ ] **Step 5: Screenshots** of `/login` (unchecked, checked, both themes, 320/360/1440) and `/accept-terms` (incl. the inline error) → `$TMPDIR/stepler-legal-screens/F2/`.
- [ ] **Step 6: Commit** `feat(web): legal checkbox on the sign-in card; accept-terms fallback`.

### Task 9: Account «Правові документи», ADR 0016, docs and PR F2

**Files:**
- Create: `apps/web/src/app/app/account/legal-status.tsx` (`LegalStatusBlock`)
- Modify: `apps/web/src/app/app/account/page.tsx` (fourth `SettingBlock`, icon `Scale`), `apps/web/messages/uk.json` + `en.json` (`account.legal.*`)
- Create: `docs/architecture/decisions/0016-legal-documents-and-acceptance.md`
- Modify: `docs/architecture/mvp-architecture-spec.md` §6 ("Legal acceptance": recorded at registration — the checkbox on the sign-in card sends the current versions with the magic-link request / Google start; the API stores them on the token row / in the signed OAuth transaction and writes the rows in the sign-in transaction; `AuthGuard` gate; `/accept-terms` fallback for pre-slice accounts, stale links and `requireReacceptance`), §7.1 (`LegalAcceptance` + `requestId`, drop "not created in Phase 2"; `MagicLinkToken` + the two version columns), §9 (`GET /auth/methods` and `POST /auth/magic-link` carry `legal`; `GET /auth/google/start?terms=&privacy=`; `GET /me` returns `legal`; `POST /me/legal-acceptances` without the "slice 10" tag, marked "fallback"), §15 (full implemented behaviour, [L1]–[L4], and the wording "acceptance is recorded at the request that starts registration and applied when the account is created or the sign-in completes"); `docs/architecture/decisions/0006-admin-authentication.md` (under "Implemented design": the legal versions on the token row and in the `st_oauth` transaction, the acceptance gate in `AuthGuard`); `BOOTSTRAP.md` (slice 10 status: implemented, PRs F1 + F2; [C20] stays until E2); `docs/product/mvp.md` (+ «Admin acceptance of Terms and Privacy — built in slice 10 (PR F2): …»); `docs/legal/README.md` (acceptance section: what a bump does with and without `requireReacceptance`); `docs/development/README.md` (env rows already in F1; add the `signInAs` note under tests if such a section exists)

**Interfaces — consumes:** `MeResponse.legal`, `legalPath`, `useFormatter`.
**Interfaces — produces:**
- `LegalStatusBlock()` (client): one row per `me.legal.documents`: the document title as a new-tab link, `account.legal.current` «Чинна версія {version}», and either `account.legal.acceptedAt` «Прийнято {date} (версія {version})» or `account.legal.notAccepted` «Не прийнято»; no button (the interstitial handles forced re-acceptance; [L3]).
- Messages `account.legal.title` «Правові документи», `account.legal.hint` «Умови й політика, які ви прийняли, і їхні чинні версії.», plus the three above (+ en).

- [ ] **Step 1: Design pass**, implement the block; `pnpm --filter @stepler/web test typecheck lint` → PASS; extend the e2e journey from Task 8 with one assertion: after signing in with the box checked, «Акаунт» shows «Прийнято» twice.
- [ ] **Step 2: ADR 0016** — context (D15/F6/F8, no texts yet, [C20]); decision (registry in contracts + Markdown in the repo; checkbox on the sign-in card with the versions carried on the `MagicLinkToken` row and in the signed `st_oauth` transaction, rows written in the sign-in transaction; server gate in `AuthGuard`; `/accept-terms` fallback; no IP; re-acceptance flag; `LEGAL_CONTACT_EMAIL`; start-up readiness check); alternatives (interstitial as the primary path — recommended by engineering, not chosen by the owner; DB-stored documents — rejected for MVP: no editor, no reviewer, no diff; MDX/TSX content; build-time gate); consequences (texts are a PR; a bump is a commit; two transport paths to keep in step with the registry; the gate adds one include to session resolution; a stale link signs in but records nothing and lands on the fallback); status Accepted, date 2026-10-04, owner decisions [L1]–[L4].
- [ ] **Step 3: Docs** listed above; design-review feedback batched; `pnpm lint typecheck test build`, `pnpm e2e`, `bash docker/scripts/verify-images.sh` green; `pnpm db:check` clean.
- [ ] **Step 4: Commit** `feat(web): legal documents on the account page; docs: ADR 0016, spec §15` and open PR F2 against `dev`.

---

## Checkpoints

- After **Task 7**: one independent API/authorization review (the gate's exemption list, the server-side enforcement of the checkbox on both entry points, the stale-version path, the signed transaction, idempotency).
- Before each PR: the owner's design review of that PR's screenshots, feedback in one commit.
- After each PR: one whole-branch review, one fix round, merge to `dev` with a merge commit.
- Staging: F1 after E1; F2 any time after F1. Production: only after E2 (real texts, `draft: false`, real e-mail, no `LEGAL_ALLOW_DRAFT`).

## Doc conflicts this plan resolves (to record in the docs it touches)

1. **Spec §6 and §15** say acceptance is "recorded at registration"; made precise [L1]: the acceptance is **given** at the request that starts registration (the checkbox on the sign-in card, versions carried on the magic-link token / in the signed OAuth transaction) and **recorded** when the account is created or the sign-in completes, in that transaction; accounts from before this slice, stale links and forced bumps go through the `/accept-terms` fallback → §6/§15 rewritten in Task 9.
2. **Spec §7.1** `LegalAcceptance` has no `requestId`; the rows need correlation without an IP [L2] → column added, §7.1 updated in Task 9.
3. **Spec §15** "Document updates do not force re-acceptance without a separate decision" → made concrete as the per-version `requireReacceptance` flag [L3] (Task 9).
4. **Spec §4** calls the legal pages "static"; ADR 0011 already notes every locale-dependent route is dynamic → §4 wording "server-rendered" in Task 9.
5. **ADR 0013 / spec §14** "public abuse contact published in the legal documents" → it is configuration (`LEGAL_CONTACT_EMAIL`), rendered into both pages, never hardcoded (Task 4).
6. **BOOTSTRAP [C20]** "guest contribution must not reach production before the guest notice" → the notice alone is not enough: the texts must be real (`draft: false`) and the readiness check enforces it (Task 4).
7. **`verify-images.sh`, `e2e/playwright.config.ts`, `render.yaml`** assume a built web server starts with `API_INTERNAL_URL` alone → every built server outside production now also needs `LEGAL_ALLOW_DRAFT=true` while the texts are drafts (Task 2); `next dev` is exempt.

## Out of scope

- Content reports and the operator flow (slice 9); cookie-consent banners (no third-party cookies or analytics exist); a privacy-request form (F6: e-mail channel, handled manually); a DB-backed legal editor; automatic e-mails on a document bump; deleting accounts that never accepted (nothing to purge yet; revisit with retention).
- Real legal texts and the real contact address (owner action E2).
