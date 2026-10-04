// `output: 'standalone'` does not include static assets or files read at runtime; copy them
// next to server.js. `content/` holds the legal texts (read with fs at request time, so the
// file tracer cannot be relied on to find them: it missed them in the Docker build).
import { cpSync, existsSync } from 'node:fs';

const target = '.next/standalone/apps/web';
cpSync('.next/static', `${target}/.next/static`, { recursive: true });
if (existsSync('public')) cpSync('public', `${target}/public`, { recursive: true });
cpSync('content', `${target}/content`, { recursive: true });
