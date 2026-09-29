# Development

## Expected local services

- web (native)
- api (native)
- worker (native, from the processing slice)
- postgres 18 (Docker Compose)
- S3-compatible storage emulator (Docker Compose; choice pending spike S4)
- Mailpit for magic-link emails (Docker Compose)

## Commands

Exact commands should be established by the project bootstrap and documented here after tooling is initialized.

## Quality gates

Before merge:
- lint;
- typecheck;
- unit/integration tests;
- E2E for critical flows;
- build;
- review.

## Environment variables

Document variable names and purpose, never actual secrets.

Separate staging and production credentials.
