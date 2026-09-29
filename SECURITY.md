# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Report them privately through GitHub: **Security → Report a vulnerability** on this repository. Include the affected component, steps to reproduce and the impact.

## Handling secrets

- Real credentials never go into the repository. Only `*.env.example` templates with placeholder or local-only values are tracked.
- CI scans the full git history for secrets on every push and pull request (`secrets` job, gitleaks).
- Staging and production use separate credentials. None of them are shared with local development.
