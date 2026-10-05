import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The preview never calls a guest API (plan Task 12): no module it imports, directly or through
// other app modules, is one of the guest API modules at run time. Package imports are not
// followed.

const SRC = fileURLToPath(new URL('../../../../', import.meta.url));
const FORBIDDEN = [
  'guest/api.ts',
  'guest/own-frames.tsx',
  'guest/use-guest-session.ts',
  'guest/upload/transport.ts',
];

function resolveImport(from: string, specifier: string): string | null {
  const base = specifier.startsWith('@/')
    ? resolve(SRC, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(from), specifier)
      : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (existsSync(candidate) && !candidate.endsWith('/')) {
      try {
        readFileSync(candidate);
        return candidate;
      } catch {
        // A directory.
      }
    }
  }
  return null;
}

/** Every app module reachable from `entry` at run time (type-only imports are erased). */
function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/^(import|export)(\s+type\b)?[^;]*?from\s+'([^']+)'/gms)) {
      if (match[2] !== undefined) continue;
      const next = resolveImport(file, match[3]!);
      if (next !== null) queue.push(next);
    }
  }
  return seen;
}

describe('the preview’s imports', () => {
  it('reach no guest API module', () => {
    const modules = [
      ...reachable(fileURLToPath(new URL('./preview-client.tsx', import.meta.url))),
    ].map((file) => file.slice(SRC.length));
    expect(modules).toContain('guest/static-slots.tsx');
    for (const forbidden of FORBIDDEN) expect(modules).not.toContain(forbidden);
  });
});
