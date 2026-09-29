import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { buildOpenApiDocument, serializeOpenApi } from '../src/openapi/openapi.js';
import { testEnv } from './support/env.js';

const SNAPSHOT = fileURLToPath(new URL('../openapi.json', import.meta.url));

/**
 * The committed `openapi.json` is the public API contract. `pnpm openapi:write` regenerates it
 * (OPENAPI_WRITE=1); otherwise this test fails when the generated document differs.
 */
test('openapi.json matches the generated document', async () => {
  const app = await createApp(testEnv());
  const generated = serializeOpenApi(buildOpenApiDocument(app));
  await app.close();
  if (process.env.OPENAPI_WRITE === '1') {
    await writeFile(SNAPSHOT, generated);
    return;
  }
  const committed = await readFile(SNAPSHOT, 'utf8').catch(() => '');
  expect(generated, 'openapi.json is stale: run `pnpm --filter @stepler/api openapi:write`').toBe(
    committed,
  );
});
