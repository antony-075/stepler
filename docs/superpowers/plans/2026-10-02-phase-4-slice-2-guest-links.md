# Stepler Phase 4, Slice 2: Guest Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every collection has a working default guest link, created with it, and the admin can share it (copy, QR preview, PNG/SVG download), choose what guests may do and see, pause and resume it, and rotate it. The admin can also create additional links with their own permissions and revoke them. Anyone opening a link gets an honest page for its state: the collection's title for a live link, or a "paused", "no longer valid", "closed" or "not found" page.

**Architecture:**
- API: a new `guest-access` module (spec §5) with three parts:
  - `GuestLinkTokens`: generate, hash, encrypt, decrypt, build the URL;
  - `GuestLinksService`: the admin side, owner-scoped;
  - `GuestLinkResolver`: the public side, which slice 3's session exchange reuses.
- `CollectionsModule` imports `GuestAccessModule` to create the default link inside the existing create transaction. `guest-access` never imports `collections`: it does its own owner-scoped lookup, so the modules have no cycle.
- Tokens follow ADR 0007 and spec §7.2. A token is 32 random bytes in base64url. The database keeps its SHA-256 hash for lookup and an AES-256-GCM ciphertext so the admin can see the link again. Revoking a link deletes its ciphertext.
- QR codes are made in the browser (spec §4) from the link URL that the admin API returns. One small encoder library, our own SVG and PNG rendering.
- Web:
  - a new admin page `/app/collections/[id]/access`;
  - a Share dialog on the collection page;
  - the default link's state on dashboard rows;
  - a public page `/g/[token]` that shows the link's state. It has no session and no upload (slices 3 and 5).

**Tech Stack:** As slice 1:
- NestJS 12 with Standard Schema validation, `@nestjs/throttler`, Prisma 7.10 on PostgreSQL 18, `node:crypto`;
- Zod 4 contracts;
- Next.js 16 App Router, next-intl, TanStack Query 5, React Hook Form;
- `@stepler/ui` (Radix/shadcn), Vitest, Storybook, Playwright;
- **one new web dependency**, a QR encoder, chosen in Task 7 under rule 14.

**Spec:**
- `docs/product/PRODUCT.md`:
  - §3.3, §5.3 ("creating a collection automatically creates its default guest link");
  - §5.4, §6.2, §7 (visibility), §8, §10 (QR);
  - §27 Journeys 1 and 6, §28 (expired, revoked or invalid link; a link revoked while it is open);
- `docs/product/acceptance-criteria.md` (Collection: "A default guest link is created"; Guest: "Invalid/revoked links cannot access protected collection content");
- `docs/product/user-stories.md` A2–A5;
- `docs/architecture/discovery-questions.md`:
  - D7 (permissions), D8 (revoke and rotation), D9 (no expiry in MVP);
  - F3 (view-only links), F4 (deactivate vs revoke), F5 (sessions belong to the collection);
- `docs/architecture/mvp-architecture-spec.md`:
  - §4 (`/g/[token]`, no-referrer, client-side QR);
  - §5, §7.2 `GuestLink`, §7.4 (audited link actions), §8, §9 (resource map), §9.1;
  - §13.1 ("Guest session creation 30 / minute per IP");
- ADR 0004, 0005, 0007, 0010, 0011, 0015;
- `docs/design/DESIGN-SYSTEM.md`:
  - §5.15 (LinkPanel, LinkRow, CopyField, QR);
  - §6.5 (dashboard row "● Посилання активне"), §6.6 (Share and QR in the collection header), §6.7 (Access layout);
  - §6.10 (link-state pages), §7.1 (Access column);
  - §8 (QR rotation motion), §11.3 ("QR stays light in dark"), §12.14, §12.16;
- `docs/ux/design-system.md` (implemented admin patterns);
- the slice 1 plan, owner decision D3 (default link plus backfill).

## Prerequisites

- Slice 1 is merged into `dev` (PR #22), and the branch `feat/phase-4-guest-links` is cut from `dev`.
- The owner has answered "Decisions for the owner" below or accepted the recommended defaults. Tasks are written against the defaults; a different answer changes only the steps marked **[G#]**.

## Decisions for the owner

**Status: all recommended defaults G1–G10 approved by the owner on 2026-10-02, with G10 raised to 120 resolves per minute per IP (configurable). Execution: subagents implement; independent review after the API/authz tasks (3–6) and one final review; minors batched.**

The spec, the ADRs and the discovery answers do not settle these, or they conflict. Each one changes behaviour. The recommended default is in bold.

1. **[G1] Token storage: hash only, or hash plus ciphertext.**
   - The brief for this slice says "only a hash in DB". ADR 0007 and spec §7.2 (accepted) say a SHA-256 hash for lookup **plus** an AES-256-GCM ciphertext, so the owner can see the link and QR again.
   - With a hash only, the link can be shown once. After that, losing it means rotating, which kills every printed QR.
   - **Recommended: follow ADR 0007.** The ciphertext is set to `NULL` when a link is revoked, so revoked tokens are not stored at all.
   - **Key source.** The key is an HKDF subkey of the existing `APP_SECRET` (purpose `guest-link-token`, the pattern in `crypto/keys.ts`), with `tokenKeyId = 'app-secret-v1'`. That means no new per-environment secret, and nothing to add on Render.
   - Consequence: if `APP_SECRET` is rotated, existing links keep working (lookup is by hash), but the admin can no longer see them until each is rotated. A second key id can be added then.
   - Alternative: a dedicated `GUEST_LINK_TOKEN_KEY` env var. Independent of `APP_SECRET`, but one more required secret in every environment.
2. **[G2] Link URL, domain and QR content.**
   - **Recommended: `{APP_ORIGIN}/g/{token}`** (spec §4 and §3). The `stepler.app/c/k7Xa…` in the C artboards is illustrative only.
   - The token is 43 characters; the QR encodes the full URL. There are no short links and no redirect service.
   - The domain is whatever `APP_ORIGIN` is: the `onrender.com` origin on staging today.
   - **Risk to note:** a printed QR is tied to the origin forever, so the production domain must be final before real events use printed codes. That decision belongs to production setup, not this slice.
3. **[G3] Permissions of a new default link, and how much of the model the UI shows.**
   - **Recommended:** `canUploadFiles = true`, `canSubmitText = true`, `canDeleteOwn = true`, **`canViewGallery = false`** (contribution-only). This is privacy by default: guests do not see each other's photos until the admin opts in.
   - The admin changes visibility on the Access page (D7: visibility is a per-link permission, as approved in slice 1).
   - `canDeleteOwn` is stored but **not shown** in the UI until slice 8 implements it. Every link that can contribute keeps it set to `true`.
   - Alternative: shared gallery by default, which makes for a livelier event but exposes guests' photos to each other.
4. **[G4] Default links for collections created before this slice (backfill, slice-1 D3).**
   - A SQL data migration cannot do this. PostgreSQL cannot produce our AES-GCM ciphertext, so the admin could never see such a link.
   - **Recommended: "ensure on read".** `GET /collections/{id}/guest-links` creates the missing default link, under a lock on the collection row and audited as actor `SYSTEM`. Only collections from before slice 2 ever take this path, and it needs no deploy step.
   - Until a legacy collection's Access page (or Share dialog) is opened, its dashboard row shows no link status.
   - Alternative: a one-off backfill script added to Render's `preDeployCommand`. Complete at once, but it adds an ops step and a script to maintain for a handful of staging rows.
5. **[G5] What a guest sees for each link state.** Codes are checked in this order, so the permanent state wins:

   | Situation | API | Page (DESIGN-SYSTEM §6.10) | Collection title shown? |
   |---|---|---|---|
   | Malformed or unknown token | `404 NOT_FOUND` | «Сторінку не знайдено» | no |
   | Collection `DELETING`, or owner `BLOCKED` | `410 COLLECTION_UNAVAILABLE` | «Колекція недоступна» | no |
   | Link `REVOKED` (an additional link that was revoked, or a default link that was rotated) | `410 LINK_REVOKED` | «Посилання більше не діє» + «Попросіть в організатора нове» | no |
   | Collection `ARCHIVED` | `403 COLLECTION_ARCHIVED` | «Колекцію закрито» + «Організатор більше не приймає кадри» | no |
   | Link `INACTIVE` | `403 LINK_INACTIVE` | «Посилання призупинене» + «Організатор тимчасово закрив додавання» | **no** |
   | Link `ACTIVE`, collection `ACTIVE` | `200` | the placeholder [G6] | yes |

   - **Recommended:** as in the table. A paused page shows no title, because the admin may have paused the link precisely to stop exposure.
   - Revoke and rotate look the same to a guest: the old link "no longer works".
   - The archived page is the only state DESIGN-SYSTEM §6.10 does not name. Its copy is a draft.
6. **[G6] How much of the guest page this slice builds.**
   - Slice 3 owns guest sessions and the real guest landing. The upload UI comes in slice 5.
   - **Recommended:**
     - this slice adds a read-only `POST /api/v1/guest/links/resolve` (no cookie, no session) and `/g/[token]` with the state pages from [G5];
     - for a live link, the page is a placeholder: the wordmark, the collection title as h1, the description, one line saying what the organiser allows («Організатор дозволив: додавати фото й відео, писати побажання»), and «Скоро тут можна буде додати фото» (rule 18: no fake upload button);
     - slice 3 replaces the page's call with `POST /guest/sessions`, which reuses `GuestLinkResolver`, and removes the resolve endpoint if nothing else uses it.
   - **Flag:** the placeholder is reachable on staging until slices 3 and 5 land. Production is not deployed before then.
   - Alternative: no `/g/` route until slice 3. Every scanned QR would then show the generic 404.
7. **[G7] Rotating a paused default link.**
   - F4 says "old → REVOKED, new → ACTIVE".
   - **Recommended: the new link inherits the old one's status and permissions.** Rotating a paused link gives a new, still paused link. An admin who paused because a link leaked should not have it switched back on as a side effect.
   - The confirm dialog says which case applies.
   - Alternative: follow F4 literally, so the new link is always `ACTIVE`.
8. **[G8] Additional links: how many, labels, and revoked links in the list (DESIGN-SYSTEM §12.14).**
   - **Recommended:**
     - at most **10 non-revoked additional links** per collection (`LIMIT_GUEST_LINKS_PER_COLLECTION=10`; the default link does not count). Above that: `409 GUEST_LINK_LIMIT_REACHED`;
     - a label is required for additional links (1–60 characters) and absent on the default link (shown as «Гостьове посилання»);
     - the list shows revoked additional links **struck through**: the 10 most recently revoked, with no "remove from list" in MVP. Default tokens that were rotated out are never listed.
   - Alternative: hide revoked links completely (simpler, but the admin loses the record of what was turned off).
9. **[G9] Admin navigation: is the no-nav shell still enough?**
   - This slice adds a third page to a collection: content, Access, settings.
   - **Recommended:**
     - keep the global shell without navigation (the slice-1 decision; DESIGN-SYSTEM §12.16) and add a **collection section nav** under the collection header: «Кадри · Доступ · Налаштування», as links with `aria-current`. That is the tab row of §6.6, minus tabs that do not exist yet;
     - the sidebar plus search header from the D-dashboard artboard (which the owner likes) is worth it once the admin has more than one global destination, or search has something to search: proposed for slice 7 (content management). Revisit then.
   - Alternative: build the sidebar shell now. More layout work, and no second global destination to put in it yet.
10. **[G10] Rate limit on the public resolve endpoint.**
    - **Recommended: 30 per minute per IP** (spec §13.1's value for guest session creation, which this endpoint stands in for), from `LIMIT_GUEST_LINK_RESOLVE_PER_IP_PER_MINUTE`.
    - **Risk to note:** guests on one venue Wi-Fi (NAT) or one mobile carrier (CGNAT) share an IP. 150 people scanning in the same minute would hit 30. The page shows «Забагато спроб — спробуйте за хвилину» with Retry.
    - Brute force is not the concern: a 256-bit token cannot be guessed, so the limit only bounds load. Raising it (for example to 120 per minute) is a config change, not a code change. Owner: keep 30, or raise it now?

## Deliberate choices (low risk; override if you disagree)

- **No expiry in MVP.** Discovery D9 already decided it: links are valid until revoked. `expiresAt` is a nullable column added later. This slice adds no column for it.
- **No constant-time compare.** Lookup is `WHERE tokenHash = sha256(input)` on a unique index. Timing can reveal at most something about stored *hashes*, and an attacker cannot choose inputs that land on a chosen hash (preimage resistance), so a timing oracle gains nothing. The token has 256 bits of entropy, so a fast unsalted hash is enough (as for sessions, spec §6).
- **No enumeration.** Every unknown or malformed token gets the same `404`. A revoked token reveals only that it once existed, which its holder already knows. Link ids are UUIDv7, but every id-based admin route is owner-scoped, and the public side has no id-based route.
- **The resolve call is a `POST` with the token in the body**, not `GET /…/{token}`. That keeps the token out of API access logs and proxy URLs. As an unsafe method it goes through the existing CSRF origin check, which the same-origin web proxy passes.
- **Idempotency:**
  - rotate takes `{ expectedLinkId }`. If the live default is no longer that id, the call returns the current default with `200`, so a double click or a stale tab never rotates twice;
  - pause, resume and revoke are conditional `updateMany` calls, audited only when something changed;
  - creating an additional link has no `Idempotency-Key` (the button is pending-locked and the cap bounds duplicates; spec §9 lists keys only for texts and reports).
- **Rotate exists only for the default link and revoke only for additional ones** (D8, F4). Revoking the default link → `409 DEFAULT_LINK_NOT_REVOCABLE`. Any change to a revoked link → `409 LINK_REVOKED`.
- **A permission change is a `PATCH`, last write wins.** The contract enforces the combination rules (at least one of upload, text or gallery; delete-own needs a contribution permission), and SQL CHECKs back them up. Changes reach guests on their next request (no caching: the resolver reads the row every time).
- **The permission editor uses two plain questions, not the presets of §6.7.**
  - «Що гості можуть додавати»: checkboxes «Фото, відео й документи» and «Побажання»;
  - «Що гості бачать»: radios «Кадри всіх гостей» and «Лише свої»;
  - a view-only link is both boxes unchecked with «Кадри всіх гостей». Unchecked boxes with «Лише свої» is invalid, with an inline message;
  - this covers every valid combination with fewer controls. The design pass may add presets as shortcuts on top.
- **Admin DTOs carry `url`** (decrypted, built from `APP_ORIGIN`), which is `null` for revoked links. Responses that contain a URL have `Cache-Control: no-store`. Tokens and URLs never appear in logs, audit metadata or error bodies.
- **Audit actions:**
  - `guest_link.create`, `guest_link.update` (metadata: the four permission booleans before and after, and whether the label changed; never the label text), `guest_link.deactivate`, `guest_link.activate`, `guest_link.revoke`, `guest_link.rotate` (target is the new link, metadata `{ replacedLinkId }`);
  - `targetType: 'guest_link'`;
  - each recorded in the same transaction as the change. A default link created with a collection is audited too.
- **Archived collections:** the admin can still manage their links. The Access page shows an info `Alert` saying links do not work while the collection is archived. A `DELETING` collection's links are `404` to the admin.
- **QR:**
  - error correction level M, quiet zone 4 modules, dark modules (`#1A1A1A`, or the ink token's hex) on `#FFFFFF` in both themes (§11.3);
  - PNG for print at 2048×2048 px, with whole-pixel modules; SVG as one `<path>` with `shape-rendering="crispEdges"`;
  - file names `stepler-qr-{title}.png|svg`, with characters forbidden in file names stripped, at most 60 characters, and `stepler-qr` when nothing is left.
- **The rotation motion** follows §8: the old QR is crossed out in 200ms, then crossfades to the new one; with reduced motion, the new QR appears with the text «Посилання оновлено».
- **Dashboard:** active rows show «● Посилання активне» or «◌ Посилання призупинене» from a new `Collection.defaultLinkStatus` field. Archived rows and legacy rows (`null`) show nothing.
- **New root script:** `pnpm e2e` keeps its name but builds the API into `apps/api/dist-e2e` (Task 1). README gets a row.

## Pre-implementation gate (rule 19)

- **Similar code:**
  - `tokens.ts` (`generateToken`, `hashToken`, `TOKEN_PATTERN`) and `crypto/keys.ts` (HKDF purposes);
  - `CollectionsService` (owner scoping, conditional transitions, `lockOwner`, audit in the transaction);
  - `RateLimitGuard`, `@Public`, `CsrfGuard`; `CopyField` and `ConfirmDialog` in `@stepler/ui`.
- **Data:** a new `GuestLink` table and enum, with named CHECKs and a partial unique index; one migration.
- **API:** 7 admin endpoints and 1 public endpoint. `Collection` gains `defaultLinkStatus` (an additive change).
- **Permissions:** link management is owner-only (spec §8 "Manage links: own collections"; the operator has none). Resolve is public and rate-limited.
- **Third parties:** none at runtime. One QR encoder library in the browser bundle; no data leaves the browser.
- **Retry:** see the idempotency choice above. Two concurrent rotates leave exactly one live default (partial unique index plus a row lock).
- **Partial failure:** the collection and its default link share one transaction. Rotate (revoke the old link, insert the new one, audit) is one transaction.
- **Deletion:** links cascade with the collection's eventual hard delete (slice 5 purge). Revoke is terminal and wipes the ciphertext.
- **Expiration:** none (D9).
- **Mobile:** the Access page, the Share dialog and the guest pages are designed at 320–360 first (QR 180px at 320, 200px from 375, 160px on the left from 640; §7.1).
- **Tests:**
  - contracts unit tests; crypto unit tests; QR round-trip tests;
  - API integration tests with an authorization matrix and a state matrix;
  - Storybook play and axe tests; Playwright journeys on all three projects.
- **Scope:** MVP, slice 2.

## Global Constraints

- **Branch:** `feat/phase-4-guest-links` (already cut from `dev`), one commit per task, PR to `dev`, merged with a merge commit (docs/development/README.md → Branches and environments).
- **Pace over polish:**
  - per-task review raises only important findings (correctness, security, data integrity, accessibility blockers); minor findings are batched and fixed once in Task 13;
  - one full verification at the end; no repeated fix rounds on style.
- **Authorization:**
  - every admin query reaches the link through `collection.ownerId = principal.userId AND collection.status <> 'DELETING'`;
  - out of scope → `404 NOT_FOUND`;
  - the public resolver returns only the [G5] fields: never ids, owner data or other links.
- **Secrets:**
  - raw tokens exist only in memory, in the admin DTO's `url`, and in the guest's address bar;
  - they are never logged (add `linkToken` to the logging redaction test), never put in audit metadata, never in an error body;
  - `/g/*` pages send `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex` and load no third-party scripts (spec §4).
- **Contracts:**
  - schemas live in `@stepler/contracts`, with no `.transform()` and no `z.date()` at the boundary (ADR 0005);
  - DTOs never expose `tokenHash`, `tokenCiphertext`, `tokenKeyId` or `replacedById`;
  - new error codes are appended to `ERROR_CODES`, with messages in both catalogs.
- **Database:**
  - invariants are raw-SQL CHECKs and indexes with explicit names, appended to a `--create-only` migration;
  - `pnpm db:check` passes; ids are `uuidv7()`.
- **Limits:** only through `LimitsService` (env-backed). New env vars go into `env.ts`, `apps/api/.env.example`, the `turbo.json` `dev` and `e2e` `passThroughEnv` lists, and the e2e webServer env where tests need an override.
- **OpenAPI:** each controller has `@ApiTags('Guest links')` or `@ApiTags('Guest')` and `@ApiCookieAuth` on the admin routes, and each route an `@ApiResponse({ standardSchema })` for success plus documented error codes. Run `pnpm openapi:write` in the same commit.
- **Web:**
  - server state only in TanStack Query. Link keys sit under the collection key, so `useInvalidateCollections()` also refreshes links;
  - forms use React Hook Form with the contract schemas;
  - no literal UI strings; copy in `apps/web/messages/{uk,en}.json` with key parity, Ukrainian by default;
  - every destructive or irreversible action goes through `ConfirmDialog`, with its consequence spelled out;
  - touch targets ≥ 44px, nothing hover-only, no horizontal scroll at 320 or 360.
- **Direction C (ADR 0015, DESIGN-SYSTEM):**
  - focus ring is the violet `--link`;
  - the pencil appears only for selection, «нове» and the guest's main action (there is no guest main action in this slice);
  - admin primary buttons are ink;
  - no rotation, overlap or shadows on frames or on the QR frame (padding 8, radius 2);
  - the QR stays a light island in dark mode.
- **Design pass (every UI task):** before writing the screen, read and apply:
  - the frontend-design skill (`/Users/antonshapoval/.claude/plugins/cache/claude-plugins-official/frontend-design/fbe07fb6ce7d/skills/frontend-design/SKILL.md`);
  - `.claude/skills/ui-ux-pro-max`;
  - `web-design-guidelines`;
  - `responsive-design`.

  Write the resulting decisions as a 5–10 line header comment in the screen's main file. After implementing, take screenshots at 360×780 and 1440×900 in light and dark, saved outside the repository (`$TMPDIR/stepler-slice-2-screens/`). They go to the owner before the PR, not into git.
- **E2E safety:** `pnpm e2e` must not touch `apps/api/dist` while the owner's `pnpm dev` is running (Task 1 makes that true; until it is merged, do not run e2e during the owner's dev session).
- **Dependencies:** exactly one new one (the QR encoder, Task 7). Nothing else.

## Review Focus

1. **Double rotate** (a double click, two tabs, a retried request). Two concurrent `POST …/default/rotate` with the same `expectedLinkId` must both return `200` with the **same** new link id. Afterwards there is exactly one non-revoked default link, the old token resolves to `410 LINK_REVOKED`, and there is one `guest_link.rotate` audit row. Tested in Task 5 (`Promise.all`).
2. **Changing an id in the request** (IDOR). Admin B, and an operator who is not the owner, call every admin route with A's collection id or A's link id. The result is always `404`, A's rows and audit count are unchanged, and no response body contains A's URL. A link of a `DELETING` collection → `404` for its owner too. Tested in Tasks 4 and 5 (table-driven matrix) and Task 12 (e2e).
3. **Token leakage.** After a full create, rotate, revoke and resolve cycle: the captured API log output, every `AuditEvent.metadata`, every error body, and the DTO of a revoked link (`url: null`) contain neither the token nor its URL. A revoked row has `tokenCiphertext IS NULL`. Admin link responses and resolve send `Cache-Control: no-store`. Tested in Tasks 3, 5 and 6.
4. **State precedence and immediate effect.** A revoked link of an archived collection → `LINK_REVOKED`, not `COLLECTION_ARCHIVED`. A paused link of a `DELETING` collection → `COLLECTION_UNAVAILABLE`. Pause, then resolve → `403`; resume, then resolve → `200` straight away (no caching). A permission change shows up in the very next resolve. Tested in Task 6 (state matrix) and Task 12 (pause, then reload the guest page).
5. **Phone layout with long data.** A 60-character unspaced label, a 100-character collection title and the 70-character URL at 320 and 360: there is no horizontal scroll on the Access page, the Share dialog or the guest page. The URL in `CopyField` truncates with the full value still copyable, and the QR is never below 180px. Tested in Task 8 (stories at `small`/`phone`) and Task 12 (`scrollWidth <= clientWidth`).

---

### Task 1: Separate API build output for e2e

The e2e run builds and starts `apps/api/dist`, which `pnpm dev` (`nest start --watch`) is also writing to. `nest build` with `deleteOutDir` deletes that output under the running dev server.

**Files:**
- Create: `apps/api/tsconfig.build-e2e.json` (extends `tsconfig.build.json`, `compilerOptions.outDir: "dist-e2e"`)
- Modify:
  - `apps/api/package.json`: add `"build:e2e": "nest build -p tsconfig.build-e2e.json"`;
  - `turbo.json`: add a task `build:e2e` (`dependsOn: ["^build", "db:generate"]`, `outputs: ["dist-e2e/**"]`), and change `e2e.dependsOn` to `["@stepler/api#build:e2e", "@stepler/web#build", "db:generate"]`;
  - `e2e/playwright.config.ts`: the API command becomes `node ../apps/api/dist-e2e/main.js`;
  - `.gitignore` and the eslint and prettier ignore lists: `dist-e2e/`;
  - `README.md`: a row saying `pnpm e2e` is safe while `pnpm dev` runs.

- [ ] **Step 1:** Check that `next dev` in Next 16 writes to its own directory (`.next/dev`) and so does not collide with the standalone build. Record the finding in the commit message. If it does collide, say so in the PR and do not fix it here.
- [ ] **Step 2: Reproduce.** Run `pnpm dev`, then `pnpm e2e` → the `apps/api/dist/main.js` mtime changes (or the dev API restarts or crashes). Note what was observed.
- [ ] **Step 3:** Apply the changes.
- [ ] **Step 4: Verify.** With `pnpm dev` running: `stat -f %m apps/api/dist/main.js` gives the same value before and after `pnpm e2e`, `curl -fsS localhost:4000/api/v1/health/live` succeeds before, during and after, and `pnpm e2e` passes. `pnpm --filter @stepler/api build` still produces `dist/main.js` (Docker is unchanged).
- [ ] **Step 5:** Commit `build(e2e): build the API into dist-e2e so e2e never touches the dev server's output`.

### Task 2: Contracts for guest links and link resolution

**Files:**
- Create: `packages/contracts/src/guest-links.ts`, `packages/contracts/src/guest-links.test.ts`
- Modify:
  - `packages/contracts/src/collections.ts`: `collectionSchema` gains `defaultLinkStatus`;
  - `packages/contracts/src/collections.test.ts`;
  - `packages/contracts/src/errors.ts`: append `GUEST_LINK_LIMIT_REACHED`, `LINK_REVOKED`, `LINK_INACTIVE`, `DEFAULT_LINK_NOT_REVOCABLE`, `COLLECTION_ARCHIVED`, `COLLECTION_UNAVAILABLE`;
  - `packages/contracts/src/index.ts`;
  - `apps/web/messages/{uk,en}.json` (`errors.*` for the six codes).

**Interfaces — produces (all exported from `@stepler/contracts`):**
- `guestLinkStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'REVOKED'])`; type `GuestLinkStatus`.
- `guestLinkPermissionsSchema`: a strict `{ canUploadFiles, canSubmitText, canViewGallery, canDeleteOwn }` (all `z.boolean()`), with `.refine`s that fail on path `[]`:
  - message `'NO_CAPABILITY'` unless upload, text or gallery is set;
  - message `'DELETE_OWN_REQUIRES_CONTRIBUTION'` when `canDeleteOwn` is set without upload or text.

  Type `GuestLinkPermissions`.
- `guestLinkLabelSchema = z.string().trim().min(1).max(60)` [G8].
- `guestLinkSchema`: a strict object; type `GuestLink`:
  - `id: z.uuid()`, `isDefault: boolean`, `label: string | null`, `status: GuestLinkStatus`;
  - `permissions: GuestLinkPermissions`;
  - `url: z.url().nullable()`;
  - `createdAt`, `updatedAt` (ISO), `revokedAt: iso | null`.
- `guestLinkListResponseSchema = z.object({ items: z.array(guestLinkSchema) }).strict()`.
- `createGuestLinkRequestSchema = z.object({ label: guestLinkLabelSchema, permissions: guestLinkPermissionsSchema }).strict()`.
- `updateGuestLinkRequestSchema`: a strict `{ label?, permissions? }`, refined to have at least one key.
- `rotateDefaultLinkRequestSchema = z.object({ expectedLinkId: z.uuid() }).strict()`.
- `guestLinkIdParamsSchema = z.object({ id: z.uuid() })`.
- `resolveGuestLinkRequestSchema = z.object({ linkToken: z.string().min(1).max(200) }).strict()`. The 43-character format is checked in the service, so a malformed token is `404` like an unknown one.
- `resolveGuestLinkResponseSchema`: a strict `{ collection: { title: string, description: string | null }, permissions: GuestLinkPermissions }`.
- `collectionSchema.defaultLinkStatus: z.enum(['ACTIVE', 'INACTIVE']).nullable()`.

- [ ] **Step 1: Failing tests** in `guest-links.test.ts`:
  - permissions: all four `false` → fails with `NO_CAPABILITY`; `{ canViewGallery: true }` with the rest `false` → passes (F3 view-only); `{ canDeleteOwn: true, canViewGallery: true }` without upload or text → `DELETE_OWN_REQUIRES_CONTRIBUTION`; an extra key → fails;
  - label: trims `'  Фотограф '`; rejects `''` and 61 characters;
  - `updateGuestLinkRequestSchema.parse({})` fails;
  - `guestLinkSchema` rejects an extra `tokenHash`, and accepts `url: null` with `status: 'REVOKED'`;
  - `resolveGuestLinkResponseSchema` rejects an extra `collectionId`.
  - In `collections.test.ts`, `collectionSchema` accepts `defaultLinkStatus: null` and rejects `'REVOKED'`.
- [ ] **Step 2:** `pnpm --filter @stepler/contracts test` → FAIL.
- [ ] **Step 3:** Implement. Error messages (uk / en):
  - `GUEST_LINK_LIMIT_REACHED`: «Досягнуто ліміту посилань для цієї колекції. Відкличте непотрібне.» / "This collection has reached its link limit. Revoke one you no longer need.";
  - `LINK_REVOKED`: «Це посилання відкликано.» / "This link has been revoked.";
  - `LINK_INACTIVE`: «Посилання призупинене.» / "This link is paused.";
  - `DEFAULT_LINK_NOT_REVOCABLE`: «Головне посилання не можна відкликати — оновіть його.» / "The main link can't be revoked. Replace it instead.";
  - `COLLECTION_ARCHIVED`: «Колекцію закрито.» / "This collection is closed.";
  - `COLLECTION_UNAVAILABLE`: «Колекція недоступна.» / "This collection is unavailable.".
- [ ] **Step 4:** `pnpm --filter @stepler/contracts test && pnpm --filter @stepler/web test` → PASS (including the catalog parity test).
- [ ] **Step 5:** Commit `feat(contracts): guest link and link resolution schemas`.

### Task 3: Data model and token crypto

**Files:**
- Modify: `apps/api/prisma/schema.prisma`, `apps/api/src/crypto/keys.ts` (add `KeyPurpose` `'guest-link-token'`)
- Create: `apps/api/prisma/migrations/<timestamp>_guest_links/migration.sql` (`--create-only --name guest_links`, then append the raw SQL)
- Create: `apps/api/src/guest-access/guest-link-tokens.ts`, `apps/api/src/guest-access/guest-link-tokens.spec.ts`
- Modify: `apps/api/test/database.e2e.spec.ts`, `apps/api/src/logging/redact.spec.ts` (a `linkToken` body or query value is redacted if it is ever logged; extend `SECRET_QUERY_KEY` if needed)

**Schema:**

```prisma
enum GuestLinkStatus { ACTIVE INACTIVE REVOKED }

model GuestLink {
  id              String          @id @default(dbgenerated("uuidv7()")) @db.Uuid
  collectionId    String          @db.Uuid
  isDefault       Boolean
  label           String?
  status          GuestLinkStatus @default(ACTIVE)
  revokedAt       DateTime?       @db.Timestamptz(3)
  replacedById    String?         @unique @db.Uuid
  tokenHash       String          @unique
  tokenCiphertext String?
  tokenKeyId      String?
  canUploadFiles  Boolean
  canSubmitText   Boolean
  canViewGallery  Boolean
  canDeleteOwn    Boolean
  createdAt       DateTime        @default(now()) @db.Timestamptz(3)
  updatedAt       DateTime        @updatedAt @db.Timestamptz(3)
  collection      Collection      @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  replacedBy      GuestLink?      @relation("LinkRotation", fields: [replacedById], references: [id], onDelete: SetNull)
  replaces        GuestLink?      @relation("LinkRotation")
  @@index([collectionId, isDefault, status, createdAt])
}
```

`Collection` gets a `guestLinks GuestLink[]` back-relation. Raw SQL appended to the migration:
- `GuestLink_has_capability` CHECK (`"canUploadFiles" OR "canSubmitText" OR "canViewGallery"`);
- `GuestLink_delete_own_needs_contribution` CHECK (`NOT "canDeleteOwn" OR "canUploadFiles" OR "canSubmitText"`);
- `GuestLink_revoked_consistent` CHECK (`(status = 'REVOKED') = ("revokedAt" IS NOT NULL)`);
- `GuestLink_ciphertext_while_live` CHECK (`(status = 'REVOKED') = ("tokenCiphertext" IS NULL) AND ("tokenCiphertext" IS NULL) = ("tokenKeyId" IS NULL)`) [G1];
- `GuestLink_replaced_only_revoked` CHECK (`"replacedById" IS NULL OR status = 'REVOKED'`);
- `GuestLink_label_rules` CHECK (`(label IS NULL OR char_length(label) BETWEEN 1 AND 60) AND (NOT "isDefault" OR label IS NULL) AND ("isDefault" OR label IS NOT NULL)`) [G8];
- `GuestLink_one_live_default` UNIQUE INDEX ON (`"collectionId"`) WHERE `"isDefault" AND status <> 'REVOKED'`.

**Interfaces — produces** (`GuestLinkTokens`, an injectable built from `API_ENV`):
- `generate(): { token: string; tokenHash: string; tokenCiphertext: string; tokenKeyId: 'app-secret-v1' }`. It reuses `generateToken`/`hashToken` from `auth/tokens.ts`. The ciphertext is base64url of `iv(12) ‖ ciphertext ‖ tag(16)`, AES-256-GCM, with the key `deriveKey(APP_SECRET, 'guest-link-token')`.
- `hashForLookup(input: string): string | null`: `null` unless `TOKEN_PATTERN` matches, otherwise `hashToken(input)`.
- `reveal(row: { tokenHash: string; tokenCiphertext: string | null; tokenKeyId: string | null }): string | null`:
  - decrypts the token, then checks `hashToken(token) === row.tokenHash`, which binds the ciphertext to its row;
  - returns `null` for a revoked row;
  - throws `Error('guest link token cannot be decrypted')` for an unknown key id or a failed tag. The caller maps that to `500 INTERNAL` and the error reporter; the message never includes the token.
- `urlFor(token: string): string` = `${APP_ORIGIN}/g/${token}` [G2].

- [ ] **Step 1: Failing tests.**
  - `guest-link-tokens.spec.ts`:
    - a generate/reveal round trip returns the same 43-character token;
    - two `generate()` calls differ in token and IV;
    - a ciphertext with one flipped byte → `reveal` throws, and the message does not contain the token;
    - a ciphertext copied from a different row (a different `tokenHash`) → throws;
    - `hashForLookup('short')` → `null`;
    - `urlFor` with `APP_ORIGIN=https://x.test` → `https://x.test/g/<token>`.
  - `database.e2e.spec.ts`:
    - each named CHECK is violated by one insert, and `constraintViolation()` names it;
    - two non-revoked default links for one collection → a unique violation `GuestLink_one_live_default`, while a revoked default plus a live one is accepted;
    - deleting a `Collection` row cascades to its links.
  - `redact.spec.ts`: `redactUrl('/x?linkToken=abc')` redacts the value.
- [ ] **Step 2:** `pnpm --filter @stepler/api test test/database.e2e.spec.ts src/guest-access` → FAIL.
- [ ] **Step 3:** Edit the schema, create the migration with `--create-only`, append the SQL, `pnpm db:migrate`; implement `GuestLinkTokens`.
- [ ] **Step 4:** PASS; `pnpm db:check` exits 0.
- [ ] **Step 5:** Commit `feat(api): guest link schema and token encryption`.

### Task 4: Default link with every collection; list links

**Files:**
- Create: `apps/api/src/guest-access/guest-access.module.ts` (provides and exports `GuestLinkTokens`, `GuestLinksService`), `guest-links.service.ts`, `guest-link-dto.ts`, `guest-links.controller.ts`
- Modify:
  - `apps/api/src/audit/audit.service.ts`: `AuditAction` gains the six `guest_link.*` actions, `targetType` becomes `'collection' | 'guest_link'`, and `actor` becomes `Principal | 'system'` (→ `SYSTEM`, `actorId: null`);
  - `apps/api/src/collections/collections.module.ts` (import `GuestAccessModule`), `collections.service.ts`, `collection-dto.ts`;
  - `apps/api/src/app.module.ts`, `apps/api/openapi.json`
- Create: `apps/api/test/guest-links.e2e.spec.ts`
- Modify: `apps/api/test/collections.e2e.spec.ts`

**Interfaces — consumes:** Task 2 schemas; Task 3 `GuestLinkTokens`; `AuditService.record`, `@RequestId()`, `CurrentPrincipal`, `signInAs`.

**Interfaces — produces:**
- `GuestLinkRow` is the Prisma model type: `import type { GuestLink as GuestLinkRow } from '../generated/prisma/client.js'`. This avoids the clash with the contract's `GuestLink` (the slice 1 `CollectionRow` pattern). The contract also exports the types `GuestLinkListResponse`, `CreateGuestLinkRequest`, `UpdateGuestLinkRequest` and `ResolveGuestLinkResponse`.
- `DEFAULT_LINK_PERMISSIONS: GuestLinkPermissions = { canUploadFiles: true, canSubmitText: true, canViewGallery: false, canDeleteOwn: true }` [G3].
- `GuestLinksService.createDefault(tx: Prisma.TransactionClient, collectionId: string, actor: Principal | 'system', requestId?: string): Promise<void>`: inserts the link and records `guest_link.create` with `{ isDefault: true }`.
- `GuestLinksService.list(principal: Principal, collectionId: string): Promise<GuestLinkListResponse>`. In one transaction:
  1. lock the owned, non-`DELETING` collection (`SELECT … FOR UPDATE`; otherwise `404`);
  2. if it has no live default, `createDefault(tx, id, 'system')` [G4];
  3. return the live default, then the live additional links (`createdAt` asc), then the 10 most recently revoked additional links [G8]. Rotated-out defaults are excluded.
- `GuestLinksService.findOwnedLink(tx, principal, linkId): Promise<GuestLinkRow & { collection: { id: string; status: CollectionStatus } }>`, which `404`s outside the owner's scope or for a `DELETING` collection. Task 5 uses it.
- `toGuestLinkDto(row: GuestLinkRow, tokens: GuestLinkTokens): GuestLink`: an explicit mapping, with `url = reveal() → urlFor()` or `null`.
- `CollectionsService.create` calls `guestLinks.createDefault(tx, row.id, principal, requestId)` after the insert, in the same transaction.
- Collection reads `include` the live default's status (`guestLinks: { where: { isDefault: true, status: { not: 'REVOKED' } }, select: { status: true }, take: 1 }`). `toCollectionDto` maps it to `defaultLinkStatus`, or `null`. There is still one query per list page: no N+1.
- Endpoint: `GET /api/v1/collections/:id/guest-links` → `200 GuestLinkListResponse`, with `Cache-Control: no-store`; `400`, `404`.

- [ ] **Step 1: Failing tests.**
  - `collections.e2e.spec.ts`:
    - `POST /collections` → `201` with `defaultLinkStatus: 'ACTIVE'`;
    - the DB has exactly one default link with the [G3] permissions;
    - audit rows `collection.create` and `guest_link.create` share the `requestId`.
  - `guest-links.e2e.spec.ts`:
    - the list for a new collection → one item, `isDefault: true`, `label: null`, and a `url` matching `^http://localhost:3000/g/[A-Za-z0-9_-]{43}$`, whose hash equals the row's `tokenHash`. The `Cache-Control` header contains `no-store`;
    - **[G4] backfill:** a collection inserted directly in the DB without links → `GET …/guest-links` creates exactly one default (`guest_link.create` with `actorType 'SYSTEM'`). `Promise.all` of two such GETs → still one link (the lock);
    - **Review Focus 2, matrix part 1:** `GET /collections/{A}/guest-links` as admin B, as the non-owner operator, and as A on a `DELETING` collection → `404`, and no default link was created for it.
- [ ] **Step 2:** `pnpm --filter @stepler/api test` → FAIL.
- [ ] **Step 3:** Implement; register the module; `pnpm openapi:write`.
- [ ] **Step 4:** `pnpm --filter @stepler/api test && pnpm --filter @stepler/api lint typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(api): default guest link with every collection, and the link list`.

### Task 5: Link management API — create, update, pause, resume, revoke, rotate

**Files:**
- Modify: `apps/api/src/guest-access/guest-links.service.ts`, `guest-links.controller.ts`, `apps/api/src/limits/limits.service.ts` (`forCollection().guestLinks`) and its spec, `apps/api/src/config/env.ts` (`LIMIT_GUEST_LINKS_PER_COLLECTION: positiveInt(10)` [G8]), `apps/api/.env.example`, `turbo.json`, `apps/api/openapi.json`
- Create: `apps/api/test/guest-links-lifecycle.e2e.spec.ts`

**Interfaces — consumes:** Task 4 (`findOwnedLink`, `toGuestLinkDto`, the collection lock), Task 3 (`GuestLinkTokens.generate`).

**Interfaces — produces** (`GuestLinksService`; every method takes `principal` first and returns `Promise<GuestLink>`):

| Method | Endpoint | Behaviour |
|---|---|---|
| `create(principal, collectionId, body, requestId?)` | `POST /collections/:id/guest-links` → `201` | Locks the collection. If the non-revoked additional links already number `forCollection().guestLinks` or more → `409 GUEST_LINK_LIMIT_REACHED`. Then inserts and audits. |
| `update(principal, linkId, body, requestId?)` | `PATCH /guest-links/:id` → `200` | Revoked → `409 LINK_REVOKED`. A `label` on the default link → `400 VALIDATION_FAILED`. Audits `guest_link.update` with the before and after booleans and `labelChanged`. |
| `deactivate` / `activate(principal, linkId, requestId?)` | `POST /guest-links/:id/deactivate` and `/activate` → `200` | Conditional `ACTIVE ↔ INACTIVE`. When nothing changes, the current state is returned with no audit. Revoked → `409 LINK_REVOKED`. |
| `revoke(principal, linkId, requestId?)` | `POST /guest-links/:id/revoke` → `200` | Default → `409 DEFAULT_LINK_NOT_REVOCABLE`. Sets `REVOKED` and `revokedAt`, and nulls the ciphertext and key id. Already revoked → `200`, unchanged. |
| `rotateDefault(principal, collectionId, { expectedLinkId }, requestId?)` | `POST /collections/:id/guest-links/default/rotate` → `200` | See the algorithm below. |

Every response carries `Cache-Control: no-store`. All routes `404` out of scope.

**Rotate algorithm** (one transaction):
1. Lock the collection row (owned, not `DELETING`).
2. Read the live default.
3. If its id ≠ `expectedLinkId`, return it as is (an idempotent retry, or a stale tab).
4. Otherwise revoke it: `REVOKED`, `revokedAt`, ciphertext nulled.
5. Insert the new default with the same permissions and the **same status** [G7].
6. Set `old.replacedById = new.id`.
7. Audit `guest_link.rotate` with target the new id and `{ replacedLinkId }`.

Revoke the old link before inserting the new one, so the partial unique index never sees two live defaults.

- [ ] **Step 1: Failing tests** in `guest-links-lifecycle.e2e.spec.ts`:
  - create `{ label: 'Фотограф', permissions: { canUploadFiles: true, … false } }` → `201`, `isDefault: false`, with a URL;
  - with `LIMIT_GUEST_LINKS_PER_COLLECTION=2` (`testEnv`): the third → `409 GUEST_LINK_LIMIT_REACHED`; after revoking one, a create → `201`. `Promise.all` of two creates at 1 of 2 → statuses `[201, 409]`;
  - `PATCH` permissions all `false` → `400`; a view-only link `{ canViewGallery: true }` → `200`; a label on the default → `400`; the audit metadata holds no label text;
  - deactivate twice → both `200` with `INACTIVE`, one audit row; activate → `ACTIVE`;
  - revoke the default → `409 DEFAULT_LINK_NOT_REVOCABLE`. Revoke an additional link → `200`, `url: null`, the DB row has `tokenCiphertext IS NULL`; revoking again → `200`. `PATCH`, activate or deactivate on it → `409 LINK_REVOKED`;
  - **Review Focus 1:** `Promise.all` of two rotates with the same `expectedLinkId` → both `200` and the same new id. There is one non-revoked default, the old row is `REVOKED` with `replacedById = new.id`, and there is one `guest_link.rotate` audit row. The new URL differs from the old one;
  - **[G7]:** rotating a paused default → the new link is `INACTIVE` with the same permissions;
  - the list after a rotation does not contain the old default;
  - **Review Focus 2, matrix part 2:** `test.each` over all six routes, as admin B and as the non-owner operator, against A's link and collection ids → `404`. A's rows and audit count are unchanged, and no B response body contains A's token. A link whose collection is `DELETING` → `404` for A;
  - **Review Focus 3:** after the whole file's flows, no `AuditEvent.metadata` (JSON text) contains any token issued in the test.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement; `pnpm openapi:write`.
- [ ] **Step 4:** `pnpm --filter @stepler/api test && pnpm --filter @stepler/api lint typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(api): manage guest links: permissions, pause, revoke and rotate`.

### Task 6: Public link resolution

**Files:**
- Create: `apps/api/src/guest-access/guest-link-resolver.ts`, `apps/api/src/guest-access/guest.controller.ts`
- Modify:
  - `apps/api/src/auth/rate-limit.ts`: add `RateLimitName` `'guest-link-resolve'` and let `named()` take a `ttl`, so this limit uses a 60s window;
  - `apps/api/src/limits/limits.service.ts` (`guestLinkResolvePerIpPerMinute`), `env.ts` (`LIMIT_GUEST_LINK_RESOLVE_PER_IP_PER_MINUTE: positiveInt(30)` [G10]), `.env.example`, `turbo.json`, `e2e/playwright.config.ts` (`'10000'`, like the magic-link limits), `apps/api/openapi.json`
- Create: `apps/api/test/guest-link-resolve.e2e.spec.ts`

**Interfaces — produces:**
- `GuestLinkResolver.resolveActive(rawToken: string): Promise<{ link: GuestLinkRow; collection: { id: string; title: string; description: string | null } }>`. It applies the [G5] order and throws the `AppError` for the first failing check:
  1. `hashForLookup` is `null`, or no row → `404 NOT_FOUND`;
  2. collection `DELETING`, or owner `BLOCKED` → `410 COLLECTION_UNAVAILABLE`;
  3. link `REVOKED` → `410 LINK_REVOKED`;
  4. collection `ARCHIVED` → `403 COLLECTION_ARCHIVED`;
  5. link `INACTIVE` → `403 LINK_INACTIVE`.

  It uses one query (the link joined with its collection and owner status), with no caching. Slice 3's `POST /guest/sessions` calls it.
- `POST /api/v1/guest/links/resolve` with body `resolveGuestLinkRequestSchema` → `200 ResolveGuestLinkResponse`:
  - the route is `@Public()` and `@RateLimit('guest-link-resolve')`, and the CSRF origin check stays on;
  - `Cache-Control: no-store`;
  - the response is built only from the resolver's `collection.title`/`description` and the link's four permissions.

- [ ] **Step 1: Failing tests** in `guest-link-resolve.e2e.spec.ts`:
  - **Review Focus 4, the state matrix**, `test.each` over (link status × collection status × owner status) → the expected status and `code` from [G5]. It includes revoked + archived → `LINK_REVOKED` and inactive + `DELETING` → `COLLECTION_UNAVAILABLE`;
  - a live link → `200`; the body passes the strict response schema (no ids) and the header has `no-store`;
  - `'x'`, a 43-character token that was never issued, and a rotated-out token → `404`, `404`, `410`. The first two have identical bodies apart from the request id;
  - deactivate → `403`, activate → `200` straight away. A `PATCH` to `canViewGallery: true` is visible in the next resolve;
  - without `Origin` → `403 CSRF_ORIGIN_MISMATCH`; without a session cookie → still served (public);
  - with `LIMIT_GUEST_LINK_RESOLVE_PER_IP_PER_MINUTE=2`: the third call → `429 RATE_LIMITED` with `Retry-After`;
  - **Review Focus 3:** with a capturing pino destination (the pattern of `logging.e2e.spec.ts`), a resolve with a valid token and one with an invalid token → the log output contains neither token.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement; `pnpm openapi:write`.
- [ ] **Step 4:** `pnpm --filter @stepler/api test && pnpm --filter @stepler/api lint typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(api): resolve a guest link token to its public state`.

**Checkpoint (API review):** one independent review of Tasks 3–6. It covers owner scoping in every query, the rotate and create locks, the token lifecycle (generate, encrypt, reveal, wipe), the error-code order and the OpenAPI diff. Important findings only.

### Task 7: QR generation in the browser (web)

**Files:**
- Modify: `apps/web/package.json` (+ lockfile), adding one QR encoder
- Create: `apps/web/src/qr/qr.ts`, `apps/web/src/qr/qr.test.ts`, `apps/web/src/qr/qr-code.tsx`

- [ ] **Step 1: Dependency check (rule 14), recorded in the commit body.**
  - Candidates: `qr` (paulmillr, zero dependencies, ESM, ships a decoder), `uqr` (unjs), `qrcode` (soldair).
  - For each: the license, the last release date and activity, open security issues, the dependency count, the size in the bundle (encoder only), ESM and TypeScript types, and whether it gives a raw module matrix.
  - Pick the smallest well-maintained one that exposes the matrix. Prefer `qr` if it passes, because its decoder lets the test round-trip, but only in tests.
  - Pin an exact version. The library is used **only** for the matrix; rendering is ours.
- [ ] **Step 2: Failing tests** in `qr.test.ts`:
  - `qrMatrix('http://127.0.0.1:3100/g/' + 'A'.repeat(43))` is square, with an odd size ≥ 21;
  - `qrSvg(matrix)` contains exactly one `<path`, `shape-rendering="crispEdges"`, a `#FFFFFF` background `rect`, and a `viewBox` that includes the 4-module quiet zone;
  - round trip: decoding the matrix (with the library's decoder, if it has one; otherwise compare against a known matrix for a fixed input) returns the input URL;
  - `qrFileName('Весілля: Олі/Тараса?')` → `'stepler-qr-Весілля Олі Тараса'`, and `qrFileName('///')` → `'stepler-qr'`.
- [ ] **Step 3: Implement:**
  - `qrMatrix(text: string): boolean[][]` (error correction M);
  - `qrSvg(matrix: boolean[][], opts?: { dark?: string }): string`;
  - `qrPngBlob(matrix: boolean[][], sizePx = 2048): Promise<Blob>`: canvas with an integer module size, centred, white;
  - `qrFileName(title: string): string`;
  - `downloadBlob(blob: Blob, fileName: string): void`;
  - `<QrCode value={url} label={string} size={number} />`: an inline SVG with `role="img"` and an `aria-label` («QR-код посилання “{label}”»).
- [ ] **Step 4:** `pnpm --filter @stepler/web test` → PASS; `pnpm --filter @stepler/web build` and note the change in first-load JS for `/app/collections/[id]/access` in the commit body.
- [ ] **Step 5:** Commit `feat(web): QR codes generated in the browser`.

### Task 8: LinkPanel and LinkRow (packages/ui)

**Files:**
- Create: `packages/ui/src/components/link-panel.tsx`, `link-panel.stories.tsx`, `link-row.tsx`, `link-row.stories.tsx`
- Modify: `packages/ui/src/components/copy-field.tsx` (only if needed: truncate a long value in the middle while still copying the full value), its story, and `docs/ux/design-system.md` (inventory rows)

**Interfaces — produces** (presentational: no data fetching and no QR logic; the QR arrives as a slot):
- `LinkPanel({ title, status, statusLabel, qr, copyField, permissionsSummary, actions, notice? }: { title: ReactNode; status: 'active' | 'paused'; statusLabel: string; qr: ReactNode; copyField: ReactNode; permissionsSummary: ReactNode; actions: ReactNode; notice?: ReactNode })`:
  - layout per §6.7 and §7.1: phone stacks status, then the QR centred (180px below 375, 200px from 375), then the URL, copy, summary and actions with full-width buttons; from 640, the QR (160px) is on the left and the details on the right;
  - the QR frame has padding 8, radius 2, `#FFFFFF`, no shadow;
  - the container reacts with `@container`.
- `LinkRow({ label, permissionsSummary, status, statusLabel, date, qr?, menu? })`, where `status: 'active' | 'paused' | 'revoked'`:
  - QR 48px;
  - revoked → a muted strike-through, the «Відкликано {date}» text and no menu;
  - phone: two lines; from `@sm`, one row.
- `RotatingQr({ children, rotationKey })`: the cross-out stroke (200ms) and then a crossfade (180ms) when `rotationKey` changes, and an immediate swap under `prefers-reduced-motion` (§8).

- [ ] **Step 1: Design.** Apply the four design skills (Global Constraints) to the panel and row anatomy within Direction C; header comment in `link-panel.tsx`.
- [ ] **Step 2: Failing tests (stories with `play`):**
  - `LinkPanel/Phone` at `small` (320): QR box width ≥ 180, and `scrollWidth <= clientWidth` with a 70-character URL (Review Focus 5);
  - `LinkPanel/Laptop`: the QR's left edge is to the left of the URL's, on the same row;
  - `LinkRow/Revoked`: no button inside, and the text has `line-through`;
  - `LinkRow/LongLabel` with 60 unspaced characters at `phone`: no horizontal scroll;
  - every story passes axe in light and dark;
  - `RotatingQr` in `storybook-reduced-motion`: the new child is present right after the key changes.
- [ ] **Step 3:** FAIL → implement → PASS: `pnpm turbo run lint typecheck test --filter @stepler/ui`.
- [ ] **Step 4:** Commit `feat(ui): link panel and link row`.

### Task 9: Access page (web)

**Files:**
- Create: `apps/web/src/api/guest-links.ts`
- Create: `apps/web/src/app/app/collections/[id]/collection-nav.tsx` [G9]
- Create: `apps/web/src/app/app/collections/[id]/access/page.tsx`, `guest-access.tsx` (client), `default-link.tsx`, `other-links.tsx`, `link-dialog.tsx` (create, and edit permissions), `link-permissions.ts` (+ `link-permissions.test.ts`)
- Modify: `apps/web/src/app/app/collections/[id]/collection-overview.tsx` and `settings/collection-settings.tsx` (render `CollectionNav`), `apps/web/messages/{uk,en}.json` (`access.*`)

**Interfaces — consumes:** Task 2 schemas, Task 7 `QrCode`/`qrSvg`/`qrPngBlob`/`qrFileName`/`downloadBlob`, Task 8 components, `collectionKey`, `useInvalidateCollections`, `useCollection`, `CopyField`, `ConfirmDialog`, `Dialog`, `Checkbox`, `RadioGroup`, `DropdownMenu`, `Alert`.

**Interfaces — produces:**
- Keys: `guestLinksKey(collectionId: string) = ['collections', 'detail', collectionId, 'guest-links'] as const`.
- Fetchers:
  - `listGuestLinks(collectionId): Promise<GuestLinkListResponse>`;
  - `createGuestLink(collectionId, body): Promise<GuestLink>`;
  - `updateGuestLink(id, body)`, `deactivateGuestLink(id)`, `activateGuestLink(id)`, `revokeGuestLink(id)`, all returning `Promise<GuestLink>`;
  - `rotateDefaultLink(collectionId, expectedLinkId): Promise<GuestLink>`.

  Every mutation ends with `useInvalidateCollections()` (the dashboard status updates too).
- `link-permissions.ts`:
  - `type PermissionForm = { uploads: boolean; texts: boolean; seeAll: boolean }`;
  - `toPermissions(form: PermissionForm): GuestLinkPermissions` (`canDeleteOwn = uploads || texts` [G3]);
  - `fromPermissions(p: GuestLinkPermissions): PermissionForm`;
  - `permissionWords(p: GuestLinkPermissions, t): string`, for example «Гості можуть: додавати, писати, бачити кадри всіх» or «Лише перегляд».
- `CollectionNav({ id, current }: { id: string; current: 'content' | 'access' | 'settings' })`: a `<nav aria-label>` of three links (≥ 44px, the current one marked with `aria-current="page"`), scrollable at 320.

**Screen behaviour** (DESIGN-SYSTEM §6.7; a column of at most 960 from `2xl`):
- The header is the same compact collection header as the overview, plus `CollectionNav current="access"`.
- **Default link (`LinkPanel`):**
  - status «● Активне» or «◌ Призупинене»;
  - QR via `RotatingQr` keyed by the link id;
  - `CopyField` with toasts «Посилання скопійовано»;
  - the permission summary;
  - actions:
    - «Завантажити QR ▾» (`DropdownMenu`: «PNG для друку», «SVG»);
    - «Змінити доступ» (the permissions dialog: the two fieldsets from Deliberate choices, inline error `access.permissions.invalid`, Save pending-locked);
    - «Призупинити» / «Відновити» (pausing needs no confirmation, since it is reversible; toast);
    - «Оновити посилання» → `ConfirmDialog`. The title is «Оновити посилання?», the text is «Старе посилання й надрукований QR перестануть працювати одразу. Гостям, які вже мають старе, доведеться дати нове.», with [G7] adding «Нове посилання теж буде призупинене» when paused. The confirm button is «Оновити».
- **Other links (`LinkRow` list):**
  - the «Нове посилання» button opens the create dialog (Dialog; a bottom sheet on phone if `Dialog` already supports it, otherwise a full-width dialog), with the label and the permissions;
  - each row's `⋯` menu: «Копіювати посилання», «Завантажити QR» (PNG), «Змінити доступ», «Призупинити»/«Відновити», «Відкликати» → a destructive `ConfirmDialog`: «Відкликати «{label}»?», «Посилання перестане працювати назавжди. Повернути його не можна — тільки створити нове.», confirm «Відкликати»;
  - revoked rows are struck through [G8];
  - at the limit: the button stays enabled and the dialog shows the `GUEST_LINK_LIMIT_REACHED` Alert instead of the form;
  - empty: one line «Окремі посилання — наприклад, для фотографа або лише для перегляду після події» plus the button.
- **States:**
  - loading: skeleton panel;
  - error: Alert + Retry;
  - not found: `CollectionNotFound`;
  - archived collection: info Alert «Колекція в архіві — посилання не працюють, доки ви її не повернете» above the panel, with controls still enabled;
  - mutation errors: inline `Alert` with `errorMessageKey(code)`.

- [ ] **Step 1: Design.** Apply the four design skills: the page hierarchy, how permissions read in words, the rotate and revoke consequence copy, and the nav at 320. Header comment in `guest-access.tsx`.
- [ ] **Step 2: Failing tests.**
  - `link-permissions.test.ts`:
    - `toPermissions({ uploads: false, texts: false, seeAll: true })` → view-only with `canDeleteOwn: false`;
    - `{ uploads: true, texts: false, seeAll: false }` → `canDeleteOwn: true`;
    - the `fromPermissions(toPermissions(x))` round trip holds for all valid forms;
    - `permissionWords` for view-only → «Лише перегляд».
  - `e2e/tests/guest-links.spec.ts` (access part, all three projects):
    - a new collection → Access shows «Активне», a QR `img` with the accessible name, and a URL matching `/g/`;
    - Copy → toast (clipboard permission granted in the Chromium projects);
    - «PNG для друку» → a `download` event whose suggested file name ends in `.png`; SVG → `.svg`.
- [ ] **Step 3:** FAIL.
- [ ] **Step 4:** Implement.
- [ ] **Step 5:** PASS: `pnpm --filter @stepler/web lint typecheck test`, `pnpm --filter @stepler/e2e exec playwright test guest-links`.
- [ ] **Step 6: Screenshots** of Access: default only; with 2 other links and 1 revoked; the rotate dialog; the permissions dialog; archived. At 360 and 1440, light and dark.
- [ ] **Step 7:** Commit `feat(web): collection access page with guest links and QR`.

### Task 10: Share from the collection page; link status on the dashboard

**Files:**
- Create: `apps/web/src/app/app/collections/[id]/share-dialog.tsx`
- Modify: `apps/web/src/app/app/collections/[id]/collection-overview.tsx` (header actions and the empty-sheet action), `apps/web/src/app/app/collection-strip.tsx` (status line), `apps/web/src/app/app/collections-dashboard.tsx` (update the header comment that says "no QR or link buttons"), `apps/web/messages/{uk,en}.json`

**Interfaces — consumes:** Task 9 `guestLinksKey`, `listGuestLinks`, QR helpers; `Collection.defaultLinkStatus`.

**Behaviour:**
- **Overview header** (§6.6): «Поділитися» (ink primary; full width under the title on phone) opens `ShareDialog`.
  - The dialog has `QrCode` 200, `CopyField`, «Завантажити QR» (PNG and SVG) and a link «Керувати доступом» → `/access`.
  - When the link is paused, an inline warning Alert «Посилання призупинене — гості його не відкриють» with «Відновити» (the activate mutation).
  - The "Settings" outline button moves into `CollectionNav` (no duplicate). An archived collection shows no «Поділитися» (the archived notice explains).
- **Empty content sheet:** the existing `contentEmptyText` («Щойно ви поділитеся посиланням…») gains a button «Поділитися посиланням» that opens the same dialog. It is not shown when archived.
- **Dashboard rows** (§6.5): a status line under the meta:
  - «● Посилання активне» (success dot);
  - «◌ Посилання призупинене» (warning dot);
  - nothing when `null` or archived.

  The dot is decorative; the text carries the meaning.

- [ ] **Step 1: Design.** Apply the four design skills to the dialog at 320 and to the row's status line. Header comment in `share-dialog.tsx`.
- [ ] **Step 2: Failing e2e** (`guest-links.spec.ts`, share part):
  - on the overview, «Поділитися» → a dialog with the QR and the same URL as Access;
  - pause on Access → back on `/app`, the row shows «Посилання призупинене» without a reload; the overview's Share dialog shows the warning, «Відновити» works, and the row returns to «активне»;
  - keyboard: `Escape` closes the dialog and focus returns to «Поділитися».
- [ ] **Step 3:** FAIL → implement → PASS (`pnpm --filter @stepler/web lint typecheck test`, the e2e file).
- [ ] **Step 4: Screenshots:** the overview with the Share dialog (active and paused) and the dashboard with both statuses, at 360 and 1440, light and dark.
- [ ] **Step 5:** Commit `feat(web): share the guest link from the collection page; link status on the dashboard`.

### Task 11: Guest link page `/g/[token]` (placeholder and link states)

**Files:**
- Create: `apps/web/src/api/guest.ts` (`resolveGuestLink(linkToken: string): Promise<ResolveGuestLinkResponse>`)
- Create: `apps/web/src/app/g/[token]/page.tsx` (RSC shell; `metadata: { title: 'Stepler', robots: { index: false, follow: false } }`, never the token or the title), `guest-link-landing.tsx` (client), `link-state-page.tsx`
- Modify: `apps/web/next.config.ts` (headers for `/g/:path*`: `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`), `apps/web/messages/{uk,en}.json` (`guestLink.*`)

**Interfaces — produces:**
- `guestLinkState(error: unknown): 'not-found' | 'unavailable' | 'revoked' | 'archived' | 'paused' | 'rate-limited' | 'failed'`, a pure function from `ApiError.code`:
  - `NOT_FOUND` / `VALIDATION_FAILED` → `not-found`;
  - `COLLECTION_UNAVAILABLE` → `unavailable`;
  - `LINK_REVOKED` → `revoked`;
  - `COLLECTION_ARCHIVED` → `archived`;
  - `LINK_INACTIVE` → `paused`;
  - `RATE_LIMITED` → `rate-limited`;
  - anything else → `failed`.

  Unit-tested in `guest-link-landing.test.ts`.

**Behaviour** [G5, G6]:
- The page calls the resolve endpoint once (`useQuery`, `retry: false`, `staleTime: 0`, no refetch on focus).
- Template (§6.10), mobile-first, the guest surface (not the admin shell): the wordmark, an h1, one line, and no button unless there is an action.
  - **Live:** h1 = the collection title (wrapping, `overflow-wrap:anywhere`), the description, «Організатор дозволив: …» (`permissionWords` from Task 9, moved to `apps/web/src/guest-links/permission-words.ts` if both surfaces need it), and «Скоро тут можна буде додати фото».
  - **Paused:** «Посилання призупинене» / «Організатор тимчасово закрив додавання» with a warning dot.
  - **Revoked:** «Посилання більше не діє» / «Попросіть в організатора нове».
  - **Archived:** «Колекцію закрито» / «Організатор більше не приймає кадри».
  - **Unavailable:** «Колекція недоступна».
  - **Not found:** «Сторінку не знайдено».
  - **Rate-limited:** «Забагато спроб — спробуйте за хвилину» + «Спробувати ще».
  - **Failed:** an inline `Alert` + «Спробувати ще».
  - **Loading:** the wordmark and a skeleton line, `aria-busy`.
- Language follows the existing resolution (no locale in the URL, spec §16). The theme is the system theme.

- [ ] **Step 1: Design.** Apply the four design skills to the state template and the placeholder (Direction C guest: the pencil appears only for a guest's main action, which does not exist yet, so there is no pencil here). Header comment in `guest-link-landing.tsx`.
- [ ] **Step 2: Failing tests.**
  - The unit test for `guestLinkState`.
  - `e2e/tests/guest-link-page.spec.ts` (all three projects):
    - a live link → the h1 is the title, and the response headers include `referrer-policy: no-referrer`;
    - pause it through the API → reload → «Посилання призупинене», with **no** title on the page;
    - rotate → the old URL → «Посилання більше не діє», and the new URL → the title;
    - revoke an additional link → «більше не діє»;
    - archive the collection → «Колекцію закрито»;
    - `/g/nonsense` → «Сторінку не знайдено»;
    - **Review Focus 5:** a 100-character title at 320 and 360 → `scrollWidth <= clientWidth`.
- [ ] **Step 3:** FAIL → implement → PASS.
- [ ] **Step 4: Screenshots:** live, paused, revoked, archived, not found, at 360 and 1440, light and dark.
- [ ] **Step 5:** Commit `feat(web): guest link page with link states`.

### Task 12: Cross-cutting journeys, isolation and responsive checks (e2e)

**Files:**
- Modify: `e2e/tests/guest-links.spec.ts`, `e2e/tests/guest-link-page.spec.ts`
- Create: `e2e/support/guest-links.ts`, with:
  - `listLinksViaApi(page: Page, collectionId: string): Promise<GuestLink[]>`;
  - `linkActionViaApi(page: Page, linkId: string, action: 'deactivate' | 'activate' | 'revoke'): Promise<void>`;
  - `createLinkViaApi(page: Page, collectionId: string, label: string, permissions: GuestLinkPermissions): Promise<GuestLink>`.

  All of them use `page.request` with the session cookie and `Origin`.

- [ ] **Step 1: Failing tests.**
  - **Journey 6:**
    - on Access, create «Після події» as view-only through the dialog; the row shows «Лише перегляд»;
    - open its URL in a fresh context → the title plus «Організатор дозволив: бачити кадри»;
    - revoke it through the row menu → confirm → the row is struck through, and the guest context reloads to «Посилання більше не діє».
  - **Rotate from the UI:** «Оновити посилання» → confirm → the URL in `CopyField` changes, the old URL in a guest context → «більше не діє», and the new one works.
  - **Review Focus 2:** admin B opens `/app/collections/{A}/access` → `CollectionNotFound`; `page.request.post` to `/api/v1/guest-links/{A's link}/revoke` → `404`; A's link still resolves.
  - **Review Focus 4:** a guest page is open on a live link; the admin pauses it in another context; the guest reloads → paused. The admin resumes; the guest reloads → live.
  - **Review Focus 5:** on all three projects, Access (with a 60-character label link), the Share dialog and the guest page with the long-title fixture → no horizontal scroll.
  - Keyboard path (`desktop-chrome`): `Tab` to «Поділитися» → `Enter` → `Tab` to Copy → `Enter` → toast → `Escape`.
- [ ] **Step 2:** `pnpm e2e` → FAIL where behaviour is missing; fix it in the owning task's files.
- [ ] **Step 3:** PASS on all three projects.
- [ ] **Step 4:** Commit `test(e2e): guest link journeys, isolation and link states`.

**Checkpoint (design review with the owner):** show the owner the screenshot set from Tasks 9–11 (360 and 1440, light and dark) and the flow: share → change access → pause → rotate → extra link → revoke → guest pages. This happens before Task 13. Owner feedback goes into one commit, `fix(web): guest link screens after design review`. Re-shoot only the screens that changed.

### Task 13: Docs, batched minors, full verification, PR

**Files:**
- Modify: `docs/architecture/mvp-architecture-spec.md`:
  - §7.2 `GuestLink`: the actual columns, the ciphertext wiped on revoke, and the HKDF key [G1];
  - §9: add `POST /guest/links/resolve` (until slice 3) [G6];
  - §13.1: the link cap and the resolve limit;
  - mark the items *Implemented in slice 2*.
- Modify: `docs/architecture/decisions/0007-guest-access-capabilities.md`. Append a dated "Implementation notes (slice 2)" section: the key comes from `APP_SECRET` via HKDF, the ciphertext is nulled on revoke, the default link is ensured on read [G4], and rotation inherits status [G7]. Write a new ADR only if the owner chose differently on [G1].
- Modify: `BOOTSTRAP.md` (slice 2 status and plan link; close the slice-1 open acceptance item "A default guest link is created"); `docs/product/mvp.md` (tick default link, additional links, revocation, QR generation); `docs/ux/design-system.md` (LinkPanel, LinkRow, CollectionNav, the guest state template); `DESIGN-SYSTEM.md` §12.14 and §12.16 (record the answers); `README.md` (the new env vars and the e2e row from Task 1).

- [ ] **Step 1:** Apply the batched minor findings (one commit, no scope growth).
- [ ] **Step 2:** Update the docs above.
- [ ] **Step 3: Full verification, once:** `pnpm format:check && pnpm turbo run lint typecheck test build build-storybook && pnpm db:check && pnpm e2e`. Everything must pass; report failures as they are.
- [ ] **Step 4:** Review the diff against `.claude/rules/11-code-review.md`, and in particular:
  - `grep -rn "guestLink\.\(find\|update\|create\)" apps/api/src` shows every admin query going through the owner-scoped helpers;
  - no DTO maps `tokenHash` or `tokenCiphertext`;
  - no `logger.*(…token…)`;
  - `/g/` has no third-party script.
- [ ] **Step 5:** Commit `docs: guest links slice; spec, ADR 0007 notes and design-system updates`. Push and open the PR `feat/phase-4-guest-links` → `dev`. The body includes:
  - a summary;
  - the owner decisions as answered;
  - the note that slice 3 replaces the resolve call [G6];
  - the production-domain risk for printed QR codes [G2];
  - the test evidence (commands and results);
  - the screenshots.

## Checkpoints

Execution follows the slice-1 pattern: subagents implement; one independent review after the API tasks and one final whole-branch review; minor findings are batched into Task 13.

- **After Task 6** (API complete): one independent review of the API (see the checkpoint under Task 6).
- **After Task 12:** the design review with the owner.
- **After Task 13:** a whole-branch review, one fix round, then merge to `dev` with a merge commit. Promote with a `dev → stage` PR when the owner wants it on staging. It needs no new Render env var under the [G1] default.

## Out of scope for slice 2

- Guest sessions, the `st_gs` cookie, re-binding and the real guest landing and gallery (slice 3); text submission (slice 4); uploads and the upload-completion check against the link state (slice 5); the guest's own-content deletion UI that `canDeleteOwn` enables (slice 8).
- Link expiry and scheduled activation (D9, post-MVP columns); password-protected links; branded QR, posters and stickers (PRODUCT §24); short links.
- The admin sidebar and search shell [G9] (proposed for slice 7).
- Operator blocking of collections and accounts (slice 9). The resolver already treats a `BLOCKED` owner as unavailable, because `User.status` exists.
