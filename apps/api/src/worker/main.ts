import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { EnvValidationError } from '../config/env.js';
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
app.useLogger(app.get(Logger));
// SIGTERM (deploys) stops polling and lets running jobs finish (JobRunner).
app.enableShutdownHooks();
