# Upstream skills

Required by `.claude/rules/23-skill-source-policy.md`. Every skill in `.claude/skills/` comes from an upstream repository. The exact revision is pinned by `computedHash` in `skills-lock.json` at the repository root.

| Skill | Upstream repository | Path in upstream |
| ----- | ------------------- | ---------------- |
| `agent-browser` | [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser) | `skills/agent-browser/SKILL.md` |
| `brainstorming` | [obra/superpowers](https://github.com/obra/superpowers) | `skills/brainstorming/SKILL.md` |
| `cloudflare-r2` | [bagelhole/devops-security-agent-skills](https://github.com/bagelhole/devops-security-agent-skills) | `infrastructure/cloudflare/cloudflare-r2/SKILL.md` |
| `e2e-testing-patterns` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/developer-essentials/skills/e2e-testing-patterns/SKILL.md` |
| `grill-me` | [mattpocock/skills](https://github.com/mattpocock/skills) | `skills/productivity/grill-me/SKILL.md` |
| `implement` | [mattpocock/skills](https://github.com/mattpocock/skills) | `skills/engineering/implement/SKILL.md` |
| `improve-codebase-architecture` | [mattpocock/skills](https://github.com/mattpocock/skills) | `skills/engineering/improve-codebase-architecture/SKILL.md` |
| `nestjs-best-practices` | [kadajett/agent-nestjs-skills](https://github.com/kadajett/agent-nestjs-skills) | `skills/nestjs-best-practices/SKILL.md` |
| `nodejs-backend-patterns` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/javascript-typescript/skills/nodejs-backend-patterns/SKILL.md` |
| `postgres` | [planetscale/database-skills](https://github.com/planetscale/database-skills) | `skills/postgres/SKILL.md` |
| `prisma-postgres` | [prisma/skills](https://github.com/prisma/skills) | `prisma-postgres/SKILL.md` |
| `receiving-code-review` | [obra/superpowers](https://github.com/obra/superpowers) | `skills/receiving-code-review/SKILL.md` |
| `requesting-code-review` | [obra/superpowers](https://github.com/obra/superpowers) | `skills/requesting-code-review/SKILL.md` |
| `responsive-design` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/ui-design/skills/responsive-design/SKILL.md` |
| `security-best-practices` | [openai/skills](https://github.com/openai/skills) | `skills/.curated/security-best-practices/SKILL.md` |
| `seo-audit` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | `skills/seo-audit/SKILL.md` |
| `shadcn` | [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | `skills/shadcn/SKILL.md` |
| `systematic-debugging` | [obra/superpowers](https://github.com/obra/superpowers) | `skills/systematic-debugging/SKILL.md` |
| `test-driven-development` | [obra/superpowers](https://github.com/obra/superpowers) | `skills/test-driven-development/SKILL.md` |
| `turborepo` | [vercel/turborepo](https://github.com/vercel/turborepo) | `skills/turborepo/SKILL.md` |
| `typescript-advanced-types` | [wshobson/agents](https://github.com/wshobson/agents) | `plugins/javascript-typescript/skills/typescript-advanced-types/SKILL.md` |
| `ui-ux-pro-max` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | `.claude/skills/ui-ux-pro-max/SKILL.md` |
| `vercel-composition-patterns` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | `skills/composition-patterns/SKILL.md` |
| `vercel-react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | `skills/react-best-practices/SKILL.md` |
| `web-design-guidelines` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | `skills/web-design-guidelines/SKILL.md` |
| `webapp-testing` | [anthropics/skills](https://github.com/anthropics/skills) | `skills/webapp-testing/SKILL.md` |
| `writing-plans` | [obra/superpowers](https://github.com/obra/superpowers) | `skills/writing-plans/SKILL.md` |

`webapp-testing` is listed in `skills-lock.json` but is not installed in `.claude/skills/`.

Removed on 2026-09-29 as unrelated to EventDrop: `media-use` and `hyperframes-animation` (HeyGen HyperFrames video tooling; `media-use` also sent telemetry to PostHog), and `caveman-learn` (token-cost tooling).

Notes from review:
- `prisma-postgres` is a deprecated compatibility name upstream; prefer `prisma-postgres-setup` if a Prisma skill is needed.
- `cloudflare-r2` (bagelhole/devops-security-agent-skills) is generic and does not cover presigned multipart uploads or CORS; rely on Cloudflare's R2 documentation for those.
