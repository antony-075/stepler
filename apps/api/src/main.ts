import { EnvValidationError, loadApiEnv } from './config/env.js';
import { createApp } from './create-app.js';

let env;
try {
  env = loadApiEnv(process.env);
} catch (error) {
  if (error instanceof EnvValidationError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

const app = await createApp(env);
await app.listen(env.API_PORT);
