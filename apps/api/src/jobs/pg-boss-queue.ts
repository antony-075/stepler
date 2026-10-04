import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type ConstructorOptions, fromPrisma, PgBoss } from 'pg-boss';
import type { Prisma } from '../generated/prisma/client.js';
import {
  JOB_NAMES,
  JOB_OPTIONS,
  type JobData,
  type JobName,
  singletonKeyFor,
} from './job-names.js';
import type { EnqueueOptions, JobQueue } from './job-queue.js';

/** pg-boss keeps its tables in its own schema; Prisma only inspects `public` (spike S7). */
export const PG_BOSS_SCHEMA = 'pgboss';

/** Injection token for the process's pg-boss options (sender in the API, worker in the worker). */
export const PG_BOSS_OPTIONS = Symbol('PG_BOSS_OPTIONS');

/**
 * The API only sends: no maintenance or cron in the request process. Its own pool (2
 * connections, separate from Prisma's) also looks up queues on the first send, so a transaction
 * holding a Prisma connection can never wait for itself (spike S7).
 */
export function senderBossOptions(databaseUrl: string): ConstructorOptions {
  return {
    connectionString: databaseUrl,
    schema: PG_BOSS_SCHEMA,
    max: 2,
    supervise: false,
    schedule: false,
  };
}

/**
 * One pg-boss instance per process. `start` installs or migrates the schema (under an advisory
 * lock, safe across processes) and creates every queue; it runs once, and again after a failure,
 * so a process that booted while PostgreSQL was down recovers on the next use.
 */
@Injectable()
export class PgBossClient implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PgBossClient.name);
  private readonly boss: PgBoss;
  private starting: Promise<PgBoss> | undefined;

  constructor(@Inject(PG_BOSS_OPTIONS) options: ConstructorOptions) {
    this.boss = new PgBoss(options);
    // pg-boss emits background errors; an EventEmitter without a listener would crash on them.
    this.boss.on('error', (error: unknown) => {
      this.logger.error({ msg: 'pg-boss error', reason: describeError(error) });
    });
  }

  /** Starts in the background: the process boots (and liveness passes) while PostgreSQL is down. */
  onApplicationBootstrap(): void {
    this.start().catch((error: unknown) => {
      this.logger.warn({
        msg: 'pg-boss start failed; retried on next use',
        reason: describeError(error),
      });
    });
  }

  start(): Promise<PgBoss> {
    this.starting ??= this.boot().catch((error: unknown) => {
      this.starting = undefined;
      throw error;
    });
    return this.starting;
  }

  /** Stops polling and closes the pool; `graceful` waits for running jobs up to `timeoutMs`. */
  async stop(graceful = false, timeoutMs = 30_000): Promise<void> {
    const started = this.starting;
    if (started === undefined) return;
    this.starting = undefined;
    try {
      await started;
    } catch {
      return; // Never started, nothing to stop.
    }
    await this.boss.stop({ graceful, timeout: timeoutMs, close: true });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }

  private async boot(): Promise<PgBoss> {
    await this.boss.start();
    try {
      for (const name of JOB_NAMES) {
        // `exclusive`: at most one queued, retrying or active job per singleton key (spike S7).
        // createQueue is a no-op for an existing queue; updateQueue applies changed options.
        await this.boss.createQueue(name, { policy: 'exclusive', ...JOB_OPTIONS[name] });
        await this.boss.updateQueue(name, { ...JOB_OPTIONS[name] });
      }
    } catch (error) {
      // Leave nothing running, so the next `start` begins from scratch.
      await this.boss.stop({ graceful: false, close: true }).catch(() => undefined);
      throw error;
    }
    return this.boss;
  }
}

/** Sends jobs through the caller's Prisma transaction (pg-boss's `fromPrisma` adapter). */
@Injectable()
export class PgBossQueue implements JobQueue {
  constructor(private readonly client: PgBossClient) {}

  async ready(): Promise<void> {
    await this.client.start();
  }

  async enqueue<N extends JobName>(
    tx: Prisma.TransactionClient,
    name: N,
    data: JobData[N],
    options: EnqueueOptions = {},
  ): Promise<void> {
    const boss = await this.client.start();
    await boss.send(name, data, {
      db: fromPrisma(tx),
      singletonKey: options.singletonKey ?? singletonKeyFor(name, data),
      ...(options.startAfterSeconds === undefined ? {} : { startAfter: options.startAfterSeconds }),
    });
  }
}

/** Name and message only: connection errors may name hosts, never values. */
export function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'unknown';
}
