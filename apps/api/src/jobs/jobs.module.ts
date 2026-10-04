import { Global, Module } from '@nestjs/common';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { JOB_QUEUE } from './job-queue.js';
import { PG_BOSS_OPTIONS, PgBossClient, PgBossQueue, senderBossOptions } from './pg-boss-queue.js';

/** The API side of the job queue: sends jobs, never runs them (the worker does, ADR 0009). */
@Global()
@Module({
  providers: [
    {
      provide: PG_BOSS_OPTIONS,
      inject: [API_ENV],
      useFactory: (env: Pick<ApiEnv, 'DATABASE_URL'>) => senderBossOptions(env.DATABASE_URL),
    },
    PgBossClient,
    { provide: JOB_QUEUE, useClass: PgBossQueue },
  ],
  exports: [JOB_QUEUE],
})
export class JobsModule {}
