import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { EnvValidationError } from '../config/env.js';
import { describeError } from '../jobs/pg-boss-queue.js';
import { shutdownWorker } from './shutdown.js';
import { WorkerModule } from './worker.module.js';
import { loadWorkerEnv } from './worker-env.js';

let env;
try {
  env = loadWorkerEnv(process.env);
} catch (error) {
  if (error instanceof EnvValidationError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

// Starting the context runs the JobRunner, which logs `worker started` once it is polling.
const app = await NestFactory.createApplicationContext(WorkerModule.forRoot({ env }), {
  bufferLogs: true,
});
const logger = app.get(Logger);
app.useLogger(logger);

// SIGTERM (deploys) and SIGINT (Ctrl+C): drain jobs, then close the clients (`shutdownWorker`).
// Not `enableShutdownHooks`, which would close Prisma and S3 under running jobs.
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    logger.log({ msg: 'worker stopping', signal });
    shutdownWorker(app).then(
      () => process.exit(0),
      (error: unknown) => {
        logger.error({ msg: 'worker shutdown failed', reason: describeError(error) });
        process.exit(1);
      },
    );
  });
}
