import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  output: 'standalone',
  // Monorepo root, so the standalone output traces workspace packages.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  poweredByHeader: false,
  // packages/ui ships TypeScript sources.
  transpilePackages: ['@stepler/ui'],
};

export default withNextIntl(config);
