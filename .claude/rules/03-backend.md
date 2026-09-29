# Backend

NestJS modular monolith.

Controllers are thin.
Services/use cases own application behavior.
Prisma access is not performed from controllers.

All input is validated server-side.

REST API is versioned.

Every endpoint needs explicit authentication/authorization behavior.

Provider SDKs stay behind backend adapters.

Never expose secrets or privileged provider credentials to browsers.
