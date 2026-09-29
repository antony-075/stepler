import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { problemDetailsSchema } from '@stepler/contracts';
import { z } from 'zod';

export const SESSION_COOKIE_SCHEME = 'st_session';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Stepler API')
    .setVersion('1')
    .addCookieAuth(SESSION_COOKIE_SCHEME, { type: 'apiKey', in: 'cookie' }, SESSION_COOKIE_SCHEME)
    .build();
  return withProblemResponses(SwaggerModule.createDocument(app, config));
}

const PROBLEM_REF = '#/components/schemas/ProblemDetails';
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

/** Documents the RFC 9457 error body as every operation's `default` response. */
function withProblemResponses(document: OpenAPIObject): OpenAPIObject {
  document.components = {
    ...document.components,
    schemas: {
      ...document.components?.schemas,
      ProblemDetails: z.toJSONSchema(problemDetailsSchema, {
        target: 'openapi-3.0',
      }) as Record<string, unknown>,
    },
  };
  for (const item of Object.values(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (operation === undefined || 'default' in operation.responses) continue;
      operation.responses.default = {
        description: 'Error (RFC 9457 problem details; `code` is stable, see ERROR_CODES)',
        content: { 'application/problem+json': { schema: { $ref: PROBLEM_REF } } },
      };
    }
  }
  return document;
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
