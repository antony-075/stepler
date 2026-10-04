import { Inject, Injectable, type OnModuleDestroy, Optional } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/** pg's default is to wait forever for a connection; fail requests fast instead. */
const CONNECT_TIMEOUT_MS = 5000;

/** Optional pool size (pg's default is 10); the worker uses a smaller pool (spike S7 budget). */
export const DATABASE_POOL_MAX = Symbol('DATABASE_POOL_MAX');

/**
 * The application's single Prisma client. It connects lazily on the first query, so the
 * process starts (and liveness passes) while PostgreSQL is down; readiness reports the database.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(
    @Inject(API_ENV) env: Pick<ApiEnv, 'DATABASE_URL'>,
    @Optional() @Inject(DATABASE_POOL_MAX) poolMax?: number,
  ) {
    super({
      adapter: new PrismaPg({
        connectionString: env.DATABASE_URL,
        connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
        ...(poolMax === undefined ? {} : { max: poolMax }),
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
