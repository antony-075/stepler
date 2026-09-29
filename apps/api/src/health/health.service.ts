import { Inject, Injectable, Logger } from '@nestjs/common';
import type { HealthReadyResponse } from '@stepler/contracts';
import { PrismaService } from '../database/prisma.service.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';

const CHECK_TIMEOUT_MS = 2000;
/** `/ready` is public; a short cache keeps frequent probes from becoming DB + R2 traffic. */
const CACHE_MS = 5000;

type CheckStatus = HealthReadyResponse['checks']['database'];

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private cached: { at: number; result: Promise<HealthReadyResponse> } | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** The latest readiness result, recomputed at most every 5 s (concurrent calls share it). */
  readiness(): Promise<HealthReadyResponse> {
    const now = Date.now();
    if (this.cached === undefined || now - this.cached.at >= CACHE_MS) {
      this.cached = { at: now, result: this.runChecks() };
    }
    return this.cached.result;
  }

  /** Runs every dependency check in parallel, each bounded by a timeout. */
  private async runChecks(): Promise<HealthReadyResponse> {
    const [database, storage] = await Promise.all([
      this.check('database', () => this.prisma.$queryRaw`SELECT 1`),
      this.check('storage', () => this.storage.checkHealth()),
    ]);
    const status = database === 'ok' && storage === 'ok' ? 'ok' : 'degraded';
    return { status, checks: { database, storage } };
  }

  private async check(name: string, probe: () => Promise<unknown>): Promise<CheckStatus> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`timed out after ${CHECK_TIMEOUT_MS} ms`));
      }, CHECK_TIMEOUT_MS);
    });
    try {
      await Promise.race([probe(), timeout]);
      return 'ok';
    } catch (error) {
      // Only the error name and message: connection errors may contain hostnames, never values.
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown';
      this.logger.warn({ msg: 'Readiness check failed', check: name, reason });
      return 'fail';
    } finally {
      clearTimeout(timer);
    }
  }
}
