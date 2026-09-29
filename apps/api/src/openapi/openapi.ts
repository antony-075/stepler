import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export const SESSION_COOKIE_SCHEME = 'st_session';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Stepler API')
    .setVersion('1')
    .addCookieAuth(SESSION_COOKIE_SCHEME, { type: 'apiKey', in: 'cookie' }, SESSION_COOKIE_SCHEME)
    .build();
  return SwaggerModule.createDocument(app, config);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, nested]) => [key, sortKeys(nested)]),
    );
  }
  return value;
}

/** Deterministic JSON (sorted keys, 2-space indent) so the committed snapshot diffs cleanly. */
export function serializeOpenApi(document: OpenAPIObject): string {
  return `${JSON.stringify(sortKeys(document), null, 2)}\n`;
}
