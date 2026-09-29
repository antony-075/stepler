import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/** pg's default is to wait forever for a connection; fail requests fast instead. */
const CONNECT_TIMEOUT_MS = 5000;

/**
 * The application's single Prisma client. It connects lazily on the first query, so the
 * process starts (and liveness passes) while PostgreSQL is down; readiness reports the database.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(API_ENV) env: ApiEnv) {
    super({
      adapter: new PrismaPg({
        connectionString: env.DATABASE_URL,
        connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
