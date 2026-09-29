# Architecture

Prefer simple, modular, reversible architecture.

Use modular monolith before microservices.

Apply separation of concerns:
- UI;
- application/use cases;
- domain;
- infrastructure/providers.

Third-party services are backend integrations by default.

Never import provider SDKs into frontend code unless browser-side integration is technically required. Document the exception.

Use dependency inversion for provider integrations.

Do not add infrastructure because it is fashionable. Add it when a concrete requirement justifies it.

When an architectural change is proposed, assess:
- complexity;
- operational cost;
- performance;
- security;
- reversibility;
- team cognitive load.
