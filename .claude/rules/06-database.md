# Database

PostgreSQL + Prisma.

Use migrations.

Design around actual access patterns, not only theoretical normalization.

Define ownership and authorization relationships explicitly.

Use transactions for multi-step operations requiring atomicity.

Use indexes based on query patterns.

Do not store large binary files in PostgreSQL.

Do not introduce premature materialized/cached tables without evidence.

Review destructive schema changes carefully.
