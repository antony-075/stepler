# API

REST API with Swagger/OpenAPI.

Initial resource areas:
- auth;
- collections;
- guest links;
- assets/content;
- uploads;
- collection settings.

Every public endpoint must document:
- authentication;
- authorization;
- request validation;
- success response;
- errors;
- pagination where applicable.

Guest endpoints must be reviewed specifically for capability leakage and IDOR/BOLA risks.

## Conventions and resource map

See ADR 0004 and `docs/architecture/mvp-architecture-spec.md` §8–§9 (status: accepted).
