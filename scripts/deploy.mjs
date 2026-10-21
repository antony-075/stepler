#!/usr/bin/env node
// `pnpm deploy:staging` / `pnpm deploy:production`: deploys the environment's branch (`stage`,
// `main`) to Render in the order the release needs (docs/deployment/staging.md → Deploy flow):
// the API first (its pre-deploy command applies the database migrations), then the worker, then
// the web app, each only after the one before is live. Render has no deploy ordering across
// services, so this script chains them through the Render API. A failed step stops the chain:
// the later services keep their current release, so an old web never meets a half-migrated
// database.
//
// Needs RENDER_API_KEY (Render → Account Settings → API Keys) in the shell or in apps/api/.env.
// The key is never printed. Usage: deploy.mjs <staging|production> [options]
//   --commit <sha>    deploy this commit instead of the branch tip (must be on the branch)
//   --only api,web    deploy only these services, still in the fixed order
//   --dry-run         show what would be deployed and stop
//   --yes             production only: skip the confirmation (needed without a terminal)
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const API = 'https://api.render.com/v1';
/** Per environment, in the order that is the point: migrations (API pre-deploy) → worker → web. */
const ENVIRONMENTS = {
  staging: {
    branch: 'stage',
    steps: [
      { key: 'api', name: 'stepler-staging-api' },
      { key: 'worker', name: 'stepler-staging-worker' },
      { key: 'web', name: 'stepler-staging' },
    ],
  },
  // render.production.yaml (docs/deployment/production.md).
  production: {
    branch: 'main',
    steps: [
      { key: 'api', name: 'stepler-api' },
      { key: 'worker', name: 'stepler-worker' },
      { key: 'web', name: 'stepler-web' },
    ],
  },
};
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
  const [name, ...rest] = argv;
  const environment = ENVIRONMENTS[name];
  if (environment === undefined)
    fail(`The first argument is the environment: ${Object.keys(ENVIRONMENTS).join(' or ')}.`);
  const args = { name, ...environment, commit: null, only: null, dryRun: false, yes: false };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--yes') args.yes = true;
    else if (arg === '--commit') args.commit = rest[(i += 1)] ?? fail('--commit needs a SHA');
    else if (arg === '--only')
      args.only = (rest[(i += 1)] ?? fail('--only needs a list')).split(',');
    else
      fail(
        `Unknown option ${arg}. Options: --commit <sha>, --only api,worker,web, --dry-run, --yes`,
      );
  }
  const keys = args.steps.map((step) => step.key);
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

/** The commit to deploy: the given one or the branch tip; it must be on the branch. */
function releaseCommit(requested, name, branch) {
  git('fetch', '--quiet', 'origin', branch);
  const sha = git('rev-parse', '--verify', `${requested ?? `origin/${branch}`}^{commit}`);
  const onBranch = spawnSync('git', ['merge-base', '--is-ancestor', sha, `origin/${branch}`]);
  if (onBranch.status !== 0)
    fail(`${sha.slice(0, 7)} is not on origin/${branch}; ${name} deploys ${branch} only.`);
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

async function findServices(key, steps) {
  const query = steps.map((step) => `name=${encodeURIComponent(step.name)}`).join('&');
  const items = await render(key, `/services?${query}&limit=20`);
  const byName = new Map(items.map(({ service }) => [service.name, service]));
  return steps.map((step) => {
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

/** Production asks first: a typo in the command must not ship a release. */
async function confirm(args) {
  if (args.name !== 'production' || args.yes) return;
  if (!process.stdin.isTTY) fail('Production needs --yes when there is no terminal to confirm.');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question('Deploy to PRODUCTION? Type "production": ');
  prompt.close();
  if (answer.trim() !== 'production') fail('Not deployed.');
}

const args = parseArgs(process.argv.slice(2));
const key = apiKey();
const { sha, subject } = releaseCommit(args.commit, args.name, args.branch);
const steps = (await findServices(key, args.steps)).filter(
  (step) => args.only === null || args.only.includes(step.key),
);
console.log(`${args.name} release ${sha.slice(0, 7)} «${subject}»`);
console.log(`Order: ${steps.map((step) => step.name).join(' → ')}`);
if (args.dryRun) process.exit(0);
await confirm(args);

process.on('SIGINT', () => {
  console.error(
    '\nStopped. A deploy already started keeps running on Render; check the dashboard.',
  );
  process.exit(130);
});
for (const step of steps) await deploy(key, step, sha);
console.log(`\n✓ ${args.name} is on`, sha.slice(0, 7));
