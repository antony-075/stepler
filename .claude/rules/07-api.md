# API

REST + OpenAPI/Swagger.

Every endpoint:
- validates input;
- documents request/response;
- enforces authorization;
- returns predictable errors;
- uses correct HTTP semantics.

Use cursor pagination for large collections.

Use idempotency for operations where retries can duplicate side effects.

Never let provider-specific response formats leak into domain APIs.
