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

Branch flow (see docs/development/README.md → Branches and environments):
- start from `dev` and open PRs against `dev`; `stage` only receives PRs from `dev`, and `main` only from `stage`;
- merge with merge commits only;
- never push directly to `main`, `stage` or `dev`; the GitHub ruleset «Protected branches» rejects direct pushes, force-pushes and deletions there.
