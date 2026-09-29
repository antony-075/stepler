import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 does not load `.env` itself. Existing variables win (CI, tests).
if (existsSync('.env')) process.loadEnvFile('.env');

// `prisma generate` needs no database; migrate commands read these at run time.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
