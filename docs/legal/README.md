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
- Files are read at request time from `apps/web/content/legal`; `next.config.ts` traces the directory into the standalone server, so a deployment carries them without extra steps.

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
- **API (PR F2, acceptance recording):** sign-in records the versions current at that moment; `GET /me` reports `legal.accepted`; with `requireReacceptance: true` on the new entry, accounts that accepted an older version are sent to the interstitial once; without it they are not. Until F2 lands the pages exist without recording.
- **Telling users about a bump:** while `requireReacceptance` is `false` nothing interrupts anyone; a plain-language note on the account page («Правові документи», F2) is enough. A forced re-acceptance interrupts the next sign-in; announce it in advance.

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
- `e2e/tests/legal.spec.ts`: both pages in uk/en, banner, 404, no-JavaScript reading at 320px, footer links, the guest notice's new tab without a referrer.
