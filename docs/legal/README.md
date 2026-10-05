# Legal documents: publishing runbook

The Terms of Service and the Privacy Policy are public, versioned pages at `/legal/terms` and `/legal/privacy` (uk/en). Their texts come from the owner/lawyer; engineering never writes legal wording. This runbook is what a text change needs. Spec: `docs/architecture/mvp-architecture-spec.md` §15; plan: `docs/superpowers/plans/2026-10-04-legal-and-acceptance.md`.

## Where things live

| What | Where |
| --- | --- |
| Texts (Markdown) | `apps/web/content/legal/<slug>.<locale>.<version>.md`, e.g. `terms.uk.v1.md`, `privacy.en.v1.md` |
| Registry of current versions | `packages/contracts/src/legal.ts` → `LEGAL_DOCUMENTS` (one entry per document) |
| Slugs ↔ documents | `TERMS` ↔ `terms`, `PRIVACY` ↔ `privacy` (`apps/web/src/legal/slugs.ts`) |
| Page frame, banner, contact block | `apps/web/src/app/legal/[document]/page.tsx`, `apps/web/src/legal/legal-article.tsx` |
| UI strings around the documents | `apps/web/messages/uk.json` / `en.json`: `legal.*` (titles, meta line, banner, contact), `guest.legalNotice` (the guest's notice; placeholder copy to be replaced by the lawyer's sentence) |
| Readiness check | `apps/web/src/legal/readiness.ts`, run at server start from `apps/web/src/instrumentation-node.ts` |

## The Markdown files

- The page renders the `h1` from the message catalog; a file starts at `##`. Sections and numbering are the text's own (`## 1. …`), so numbered clauses line up.
- Markdown only (GFM): headings, paragraphs, lists, emphasis, links. No raw HTML — `apps/web/src/legal/documents.test.ts` rejects a file with `<tag>`, an `# ` heading or less than 100 bytes, and checks that a `draft: true` entry starts with the draft line (`> Чернетка — …` / `> Draft — …`) and a published one does not.
- Both locales always exist for the current version, with the same structure.
- The contact address is written as the placeholder `[LEGAL_CONTACT_EMAIL]`, never as a literal address: the page fills every occurrence with the deployment's `LEGAL_CONTACT_EMAIL` at render time (`fillLegalPlaceholders` in `apps/web/src/legal/documents.ts`), and leaves it visibly unfilled when the variable is unset (drafts only). Every other bracketed placeholder (operator name, address, registration details, governing law, court, periods marked `[LAWYER TO CONFIRM]` / `[ПЕРЕВІРИТИ ЮРИСТОМ]`) is text the owner/lawyer replaces before `draft: false`.
- Files are read at request time from `apps/web/content/legal`; the web build copies the directory next to the standalone server (`apps/web/scripts/copy-standalone-assets.mjs`), so a deployment carries them without extra steps.

## Publishing a new version (or the first real text)

One PR, one commit:

1. Add the new file pair, e.g. `terms.uk.v2.md` + `terms.en.v2.md` (the old pair stays in the repository as history; nothing reads it).
2. Change the document's entry in `LEGAL_DOCUMENTS`:
   - `version: 'v2'` (ids are `v1`, `v2`, … — `LEGAL_VERSION_PATTERN`);
   - `effectiveDate: 'YYYY-MM-DD'` (shown on the page);
   - `draft: false` for a real text (the banner disappears; production may start);
   - `requireReacceptance`: a product/legal decision, not an engineering one. `false` (default): people who accepted an earlier version keep using the app. `true`: every admin accepts this version once more on the next sign-in (interstitial), see "What the app does with it".
3. Run `pnpm --filter @stepler/web test` (the file checks) and `pnpm --filter @stepler/contracts test` (the registry checks). CI runs both, the image check and the e2e journeys in `e2e/tests/legal.spec.ts`.
4. Merge to `dev`, promote through `stage` (verify the pages on staging in both languages), then to `main`.

Replacing a text **without** a new version (a typo) is an edit of the current file pair; the version and date stay.

## What the app does with it

- **Web:** `/legal/<slug>` renders the current version for the request's locale with the meta line «Версія vN · діє з <date>»; the draft banner shows exactly while `draft: true`; the «Контакти» block shows `LEGAL_CONTACT_EMAIL` (omitted only when the variable is unset, which is possible only with drafts allowed). The footer links and the guest notice point at the pages.
- **Acceptance (PR F2, ADR 0016):** the sign-in card's checkbox sends the versions from the registry; the sign-in records them when it completes. A link requested (or a Google sign-in started) before a bump records nothing when used after it; the person lands on `/accept-terms` and accepts the new version there. `GET /me` reports `legal.accepted` and, per document, the accepted and the required version; the account page shows both under «Правові документи».
- **A bump without `requireReacceptance`** (the default): earlier acceptances keep satisfying the document; nobody is interrupted; new sign-ins record the new version. The account page shows «Чинна версія v2» next to the accepted v1.
- **A bump with `requireReacceptance: true`:** `legal.accepted` turns false for everyone who has not accepted that exact version; the API refuses the app (`403 LEGAL_ACCEPTANCE_REQUIRED`) and the web sends them to `/accept-terms` once, including a tab that is already open. Announce it in advance.

## Environment

| Variable | Where set | Meaning |
| --- | --- | --- |
| `LEGAL_CONTACT_EMAIL` | staging (Render dashboard, owner action E1), production | The privacy/abuse contact rendered on both pages (spec §15, ADR 0013). A placeholder such as `privacy@example.com` is fine on staging; production needs the real address. |
| `LEGAL_ALLOW_DRAFT` | `true` in CI (`e2e/playwright.config.ts`), the image check (`docker/scripts/verify-images.sh`) and staging (`render.yaml`); **never in production** | Lets a built server start on `draft: true` texts and without a contact. `next dev` always allows drafts, so local development needs neither variable. |

## What enforces this

- `apps/web/src/legal/documents.test.ts`: every registry entry has both files, no `h1`, no raw HTML, the draft line matches the flag.
- `packages/contracts/src/legal.test.ts`: one entry per document, well-formed versions and dates, the status rules.
- Readiness check at server start (`assertLegalReady`): a built server exits with a message naming each problem (`TERMS v1 is a draft`, `LEGAL_CONTACT_EMAIL is not set`) unless `LEGAL_ALLOW_DRAFT=true`. On Render a failed start fails the health check and the previous version keeps serving.
- `docker/scripts/verify-images.sh`: proves the web image refuses to start without the flag and serves `/legal/terms` with it.
- `e2e/tests/legal.spec.ts`: both pages in uk/en, banner, 404, no-JavaScript reading at 320px, footer links, the guest notice's new tab without a referrer; the sign-in card's checkbox and the `/accept-terms` fallback.
- `apps/api/test/legal-acceptances.e2e.spec.ts`, `magic-link.e2e.spec.ts`, `google.e2e.spec.ts`: the gate on every route, the checkbox enforced server-side on both sign-in paths, stale versions, idempotency.
