import { EnvValidationError, loadApiEnv, retiredVariablesIn } from './config/env.js';
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

const retired = retiredVariablesIn(process.env);
if (retired.length > 0) {
  process.stderr.write(
    `Ignored (now billing entitlements, ADR 0018; remove them): ${retired.join(', ')}\n`,
  );
}

const app = await createApp(env);
await app.listen(env.API_PORT);
