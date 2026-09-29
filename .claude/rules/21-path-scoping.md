# Path-scoped rule examples

Claude Code supports path-scoped rule files. Prefer path scoping for rules that only apply to a subset of the repository.

Example:

---
paths:
  - "apps/web/**/*.{ts,tsx}"
---

Frontend-only guidance.

Example:

---
paths:
  - "apps/api/**/*.ts"
---

Backend-only guidance.

Do not add path scoping just for organization; use it when it materially reduces irrelevant context.
