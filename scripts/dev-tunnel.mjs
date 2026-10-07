#!/usr/bin/env node
// `pnpm dev:tunnel`: `pnpm dev` behind a temporary Cloudflare quick tunnel, so LiqPay's sandbox
// can reach the local API's payment callback. The tunnel's random https://*.trycloudflare.com
// address changes on every run; it is handed to the API as BILLING_CALLBACK_URL through the
// process environment, which wins over apps/api/.env (`node --env-file-if-exists` never
// overrides a variable that is already set). Local development only: while it runs, the local
// API is reachable from the internet, so stop it (Ctrl+C) when you are done with payments.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const CALLBACK_PATH = '/api/v1/billing/liqpay/callback';
const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const START_TIMEOUT_MS = 60_000;

/** The API's port: API_PORT from the shell, else from apps/api/.env, else the API's default. */
function apiPort() {
  if (process.env.API_PORT) return process.env.API_PORT;
  const file = 'apps/api/.env';
  if (existsSync(file)) {
    const port = parseEnv(readFileSync(file, 'utf8')).API_PORT;
    if (port) return port;
  }
  return '4000';
}

if (spawnSync('cloudflared', ['--version'], { stdio: 'ignore' }).error) {
  console.error('cloudflared is not installed. On macOS: brew install cloudflared');
  process.exit(1);
}

const port = apiPort();
console.log(`[tunnel] starting a quick tunnel to http://localhost:${port} …`);
const tunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let dev = null;
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  dev?.kill('SIGINT');
  tunnel.kill('SIGINT');
  setTimeout(() => process.exit(code), 3000).unref();
}

const timer = setTimeout(() => {
  console.error('[tunnel] no tunnel address after 60 s; is the network up?');
  stop(1);
}, START_TIMEOUT_MS);

function onTunnelOutput(chunk) {
  if (dev !== null) return;
  const match = URL_PATTERN.exec(chunk.toString());
  if (match === null) return;
  clearTimeout(timer);
  const callbackUrl = `${match[0]}${CALLBACK_PATH}`;
  console.log(`[tunnel] ${match[0]} → localhost:${port}`);
  console.log(`[tunnel] BILLING_CALLBACK_URL=${callbackUrl}`);
  dev = spawn('pnpm', ['dev'], {
    stdio: 'inherit',
    env: { ...process.env, BILLING_CALLBACK_URL: callbackUrl },
  });
  dev.on('exit', (code) => stop(code ?? 0));
}

tunnel.stdout.on('data', onTunnelOutput);
tunnel.stderr.on('data', onTunnelOutput);
tunnel.on('exit', (code) => {
  if (!stopping) {
    console.error(`[tunnel] cloudflared exited (${code}); stopping dev`);
    stop(1);
  }
});

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
