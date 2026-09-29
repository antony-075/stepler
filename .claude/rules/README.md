# Claude Code Rules

These rules are intentionally modular.

They encode engineering behavior that is difficult to enforce purely with TypeScript/ESLint/CI. Deterministic constraints should also be enforced by tooling where possible.

The rule set is a starting baseline. Keep it lean: when a rule repeatedly proves unnecessary, remove it; when a real recurring failure appears, add a targeted rule.

The project has also adopted:
- backend-only third-party integrations by default;
- direct browser → R2 only for authorized large-file transfer;
- requirement clarification for consequential ambiguity;
- evidence-based completion;
- architecture decisions documented as working hypotheses.
