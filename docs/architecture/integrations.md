# Integrations

## Principle

Third-party integrations belong behind the backend.

### Allowed exception

Direct browser-to-provider interaction is allowed when the provider requires it and when:
- backend creates the authorization/capability;
- capability is short-lived and scoped;
- frontend cannot obtain provider credentials;
- backend validates the result.

### Expected providers

Potential:
- Cloudflare R2;
- payment provider(s) such as LiqPay / Mono / Stripe;
- email provider;
- error monitoring;
- analytics.

Do not implement payment providers until billing requirements are approved.

Provider-specific behavior must not leak throughout the domain layer.
