#!/usr/bin/env node
// `pnpm deploy:staging`: deploys the `stage` branch to Render in the order the release needs
// (docs/deployment/staging.md → Deploy flow): the API first (its pre-deploy command applies the
// database migrations), then the worker, then the web app, each only after the one before is
// live. Render has no deploy ordering across services, so this script chains them through the
// Render API. A failed step stops the chain: the later services keep their current release, so
// an old web never meets a half-migrated database.
//
// Needs RENDER_API_KEY (Render → Account Settings → API Keys) in the shell or in apps/api/.env.
// The key is never printed. Options:
//   --commit <sha>    deploy this commit instead of the tip of origin/stage (must be on stage)
//   --only api,web    deploy only these services, still in the fixed order
//   --dry-run         show what would be deployed and stop
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const API = 'https://api.render.com/v1';
const BRANCH = 'stage';
/** The order is the point: migrations (API pre-deploy) → worker → web. */
const STEPS = [
  { key: 'api', name: 'stepler-staging-api' },
  { key: 'worker', name: 'stepler-staging-worker' },
  { key: 'web', name: 'stepler-staging' },
];
const POLL_MS = 10_000;
/** A build plus the pre-deploy migrations; far longer than a normal deploy takes. */
const STEP_TIMEOUT_MS = 30 * 60_000;
const DONE = new Set(['live']);
const FAILED = new Set([
  'build_failed',
  'update_failed',
  'pre_deploy_failed',
  'canceled',
  'deactivated',
]);

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function apiKey() {
  if (process.env.RENDER_API_KEY) return process.env.RENDER_API_KEY;
  const file = 'apps/api/.env';
  if (existsSync(file)) {
    const key = parseEnv(readFileSync(file, 'utf8')).RENDER_API_KEY;
    if (key) return key;
  }
  return fail(
    'RENDER_API_KEY is not set. Create a key in Render (Account Settings → API Keys) and add\n' +
      '  RENDER_API_KEY=… to apps/api/.env (git-ignored) or export it in your shell.',
  );
}

function parseArgs(argv) {
  const args = { commit: null, only: null, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--commit') args.commit = argv[(i += 1)] ?? fail('--commit needs a SHA');
    else if (arg === '--only')
      args.only = (argv[(i += 1)] ?? fail('--only needs a list')).split(',');
    else fail(`Unknown option ${arg}. Options: --commit <sha>, --only api,worker,web, --dry-run`);
  }
  const keys = STEPS.map((step) => step.key);
  for (const key of args.only ?? []) {
    if (!keys.includes(key)) fail(`--only takes ${keys.join(', ')}; got «${key}»`);
  }
  return args;
}

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) fail(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

/** The commit to deploy: the given one or the tip of origin/stage; it must be on stage. */
function releaseCommit(requested) {
  git('fetch', '--quiet', 'origin', BRANCH);
  const sha = git('rev-parse', '--verify', `${requested ?? `origin/${BRANCH}`}^{commit}`);
  const onStage = spawnSync('git', ['merge-base', '--is-ancestor', sha, `origin/${BRANCH}`]);
  if (onStage.status !== 0)
    fail(`${sha.slice(0, 7)} is not on origin/${BRANCH}; staging deploys ${BRANCH} only.`);
  return { sha, subject: git('log', '-1', '--format=%s', sha) };
}

async function render(key, path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${key}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    const hint = response.status === 401 ? ' (is RENDER_API_KEY right?)' : '';
    fail(
      `Render API ${init.method ?? 'GET'} ${path}: ${response.status}${hint} ${text.slice(0, 300)}`,
    );
  }
  return text === '' ? null : JSON.parse(text);
}

async function findServices(key) {
  const query = STEPS.map((step) => `name=${encodeURIComponent(step.name)}`).join('&');
  const items = await render(key, `/services?${query}&limit=20`);
  const byName = new Map(items.map(({ service }) => [service.name, service]));
  return STEPS.map((step) => {
    const service = byName.get(step.name);
    if (service === undefined) fail(`Render has no service named ${step.name} for this key.`);
    return { ...step, service };
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const elapsed = (start) => {
  const s = Math.round((Date.now() - start) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

async function deploy(key, step, sha) {
  const { service } = step;
  const start = Date.now();
  console.log(`\n→ ${step.name}: deploying ${sha.slice(0, 7)}`);
  let created = await render(key, `/services/${service.id}/deploys`, {
    method: 'POST',
    body: JSON.stringify({ commitId: sha }),
  });
  if (!created?.id) {
    // Queued behind another deploy (202) without a body: find ours among the latest.
    const recent = await render(key, `/services/${service.id}/deploys?limit=5`);
    created = recent.map((item) => item.deploy).find((d) => d.commit?.id === sha);
    if (!created) fail(`${step.name}: Render accepted the deploy but did not return it.`);
  }
  const link = `${service.dashboardUrl}/deploys/${created.id}`;
  let last = '';
  while (Date.now() - start < STEP_TIMEOUT_MS) {
    const current = await render(key, `/services/${service.id}/deploys/${created.id}`);
    if (current.status !== last) {
      console.log(`  ${elapsed(start)}  ${current.status}`);
      last = current.status;
    }
    if (DONE.has(current.status)) {
      console.log(`✓ ${step.name} is live (${elapsed(start)})`);
      return;
    }
    if (FAILED.has(current.status)) {
      fail(
        `${step.name}: ${current.status}. The later services were not deployed.\n  Log: ${link}`,
      );
    }
    await sleep(POLL_MS);
  }
  fail(`${step.name}: still not live after ${STEP_TIMEOUT_MS / 60_000} min. Check ${link}`);
}

const args = parseArgs(process.argv.slice(2));
const key = apiKey();
const { sha, subject } = releaseCommit(args.commit);
const steps = (await findServices(key)).filter(
  (step) => args.only === null || args.only.includes(step.key),
);
console.log(`Staging release ${sha.slice(0, 7)} «${subject}»`);
console.log(`Order: ${steps.map((step) => step.name).join(' → ')}`);
if (args.dryRun) process.exit(0);

process.on('SIGINT', () => {
  console.error(
    '\nStopped. A deploy already started keeps running on Render; check the dashboard.',
  );
  process.exit(130);
});
for (const step of steps) await deploy(key, step, sha);
console.log('\n✓ Staging is on', sha.slice(0, 7));
