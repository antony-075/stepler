# Git

Keep commits small and coherent.

Do not mix feature work with unrelated formatting/refactors.

Never commit:
- secrets;
- local environment files;
- generated credentials;
- temporary uploads.

Do not rewrite shared history unless explicitly requested.

Use clear commit messages.

Branch flow (see docs/development/README.md → Branches and releases):
- start from `dev` and open PRs against `dev`; never target `main` except for a release PR from `dev`;
- merge with merge commits only;
- never push directly to `main` or `dev`, even though GitHub does not enforce it yet (branch protection needs GitHub Pro for this private repo).
