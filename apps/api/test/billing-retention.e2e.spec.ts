import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { AuditService } from '../src/audit/audit.service.js';
import { EntitlementResolver } from '../src/billing/entitlement-resolver.js';
import { CollectionDeletion } from '../src/collections/collection-deletion.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PgBossClient, PgBossQueue, senderBossOptions } from '../src/jobs/pg-boss-queue.js';
import { SmtpMailer } from '../src/mail/smtp-mailer.js';
import { BillingDeletionWarningMailHandler } from '../src/worker/handlers/billing-deletion-warning-mail.handler.js';
import { BillingReadOnlyMailHandler } from '../src/worker/handlers/billing-read-only-mail.handler.js';
import { BillingRetentionHandler } from '../src/worker/handlers/billing-retention.handler.js';
import { loadWorkerEnv, type WorkerEnv } from '../src/worker/worker-env.js';
import { givePack, grantTestPlan } from './support/billing.js';
import { queuedJobs, resetDatabase } from './support/database.js';
import { TEST_DATABASE_URL, testEnv, WORKER_MAIL_ENV } from './support/env.js';
import { messageText, waitForMessages } from './support/mailpit.js';

// The retention clock (ADR 0018 [P5], [P6]; plan Task 6), with a fixed `now`.

const DAY_MS = 24 * 3600_000;
const apiEnv = testEnv();
const workerEnv = (overrides: Record<string, string> = {}): WorkerEnv =>
  loadWorkerEnv({
    ...WORKER_MAIL_ENV,
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    DATABASE_URL: TEST_DATABASE_URL,
    S3_ENDPOINT: apiEnv.S3_ENDPOINT,
    S3_REGION: apiEnv.S3_REGION,
    S3_BUCKET: apiEnv.S3_BUCKET,
    S3_ACCESS_KEY_ID: apiEnv.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: apiEnv.S3_SECRET_ACCESS_KEY,
    S3_FORCE_PATH_STYLE: 'true',
    WORKER_PURGE_BATCH_SIZE: '2',
    ...overrides,
  });

const env = workerEnv();
const prisma = new PrismaService(env);
const boss = new PgBossClient(senderBossOptions(TEST_DATABASE_URL));
const queue = new PgBossQueue(boss);
const resolver = new EntitlementResolver(prisma);
const mailers: SmtpMailer[] = [];

function clock(overrides: Record<string, string> = {}) {
  const e = workerEnv(overrides);
  return new BillingRetentionHandler(
    prisma,
    resolver,
    new CollectionDeletion(new AuditService(), queue, e),
    queue,
    e,
  );
}

const at = (iso: string) => new Date(iso);
const now = at('2027-06-15T09:00:00Z');
const trialEnded = at('2027-06-01T10:00:00Z');

async function owner(
  trialEndsAt: Date | null = trialEnded,
  email = `olena-${randomUUID()}@example.com`,
) {
  return prisma.user.create({ data: { email, trialEndsAt, emailVerifiedAt: now } });
}

const collection = (ownerId: string, title = 'Весілля') =>
  prisma.collection.create({ data: { ownerId, title } });

const reload = (id: string) => prisma.collection.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  await boss.start();
});

afterAll(async () => {
  for (const mailer of mailers) mailer.onModuleDestroy();
  await boss.stop();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

describe('scheduling', () => {
  test('an ended trial: kept 12 months from its end, one mail per episode across runs', async () => {
    const olena = await owner();
    const c = await collection(olena.id);
    const first = await clock().run(now);
    expect(first.scheduled).toBe(1);
    expect((await reload(c.id)).deleteAfter).toEqual(at('2028-06-01T10:00:00Z'));
    expect(await queuedJobs(prisma, 'mail.billing-read-only')).toHaveLength(1);
    const second = await clock().run(now);
    expect(second.scheduled).toBe(0);
    expect(await queuedJobs(prisma, 'mail.billing-read-only')).toHaveLength(1);
  });

  test('a live trial or plan schedules nothing', async () => {
    const trial = await owner(at('2027-06-20T00:00:00Z'));
    await collection(trial.id);
    const planned = await owner();
    await grantTestPlan(prisma, planned.id);
    await collection(planned.id);
    expect((await clock().run(now)).scheduled).toBe(0);
    expect(await prisma.collection.count({ where: { deleteAfter: { not: null } } })).toBe(0);
  });

  test('a pack past its retention is due at that end; its owner’s plan does not matter', async () => {
    const olena = await owner();
    await grantTestPlan(prisma, olena.id);
    const c = await collection(olena.id);
    const retentionEndsAt = at('2027-06-10T00:00:00Z');
    await givePack(prisma, c.id, { windowEndsAt: at('2026-07-10T00:00:00Z'), retentionEndsAt });
    await clock().run(now);
    expect((await reload(c.id)).deleteAfter).toEqual(retentionEndsAt);
  });

  test('more accounts than one page are all scheduled', async () => {
    for (let i = 0; i < 5; i += 1) await collection((await owner()).id);
    expect((await clock().run(now)).scheduled).toBe(5);
  });

  test('a grant clears the schedule, the stamps and the episode', async () => {
    const olena = await owner();
    const c = await collection(olena.id);
    await clock().run(now);
    await prisma.collection.update({
      where: { id: c.id },
      data: { deletionWarnedAt30: now },
    });
    await grantTestPlan(prisma, olena.id);
    const run = await clock().run(now);
    expect(run.cleared).toBe(1);
    expect(await reload(c.id)).toMatchObject({ deleteAfter: null, deletionWarnedAt30: null });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: olena.id } })).readOnlyNotifiedAt,
    ).toBeNull();
  });
});

describe('warnings and deletion', () => {
  async function scheduled(deleteAfter: Date, stamps: { w30?: Date; w7?: Date } = {}) {
    const olena = await owner();
    const c = await collection(olena.id);
    await prisma.collection.update({
      where: { id: c.id },
      data: {
        deleteAfter,
        deletionWarnedAt30: stamps.w30 ?? null,
        deletionWarnedAt7: stamps.w7 ?? null,
      },
    });
    await prisma.user.update({ where: { id: olena.id }, data: { readOnlyNotifiedAt: now } });
    return { olena, c };
  }

  test('30 days, then 7, each once across runs', async () => {
    const { c } = await scheduled(at('2027-07-05T00:00:00Z'));
    expect(await clock().run(now)).toMatchObject({ warned30: 1, warned7: 0 });
    expect(await clock().run(now)).toMatchObject({ warned30: 0, warned7: 0 });
    const later = at('2027-06-29T00:00:00Z');
    expect(await clock().run(later)).toMatchObject({ warned30: 0, warned7: 1 });
    expect(await clock().run(later)).toMatchObject({ warned30: 0, warned7: 0 });
    const jobs = await queuedJobs(prisma, 'mail.billing-deletion-warning');
    expect(jobs.map((job) => (job.data as { days: number }).days).sort()).toEqual([30, 7]);
    expect((await reload(c.id)).deletionWarnedAt7).toEqual(later);
  });

  test('a late start sends only the 7-day warning', async () => {
    await scheduled(at('2027-06-18T00:00:00Z'));
    expect(await clock().run(now)).toMatchObject({ warned30: 0, warned7: 1 });
  });

  test('with the switch off nothing is deleted', async () => {
    const { c } = await scheduled(at('2027-06-01T00:00:00Z'), {
      w30: at('2027-05-01T00:00:00Z'),
      w7: at('2027-05-25T00:00:00Z'),
    });
    expect((await clock().run(now)).deleted).toBe(0);
    expect((await reload(c.id)).status).toBe('ACTIVE');
  });

  test('switched on: never sooner than 7 days after the 7-day warning, then the usual purge', async () => {
    const on = { BILLING_RETENTION_DELETE_ENABLED: 'true' };
    const recent = await scheduled(at('2027-06-01T00:00:00Z'), {
      w30: at('2027-05-01T00:00:00Z'),
      w7: at('2027-06-13T00:00:00Z'),
    });
    const due = await scheduled(at('2027-06-01T00:00:00Z'), {
      w30: at('2027-05-01T00:00:00Z'),
      w7: at('2027-05-25T00:00:00Z'),
    });
    expect((await clock(on).run(now)).deleted).toBe(1);
    expect((await reload(recent.c.id)).status).toBe('ACTIVE');
    expect((await reload(due.c.id)).status).toBe('DELETING');
    const purges = await queuedJobs(prisma, 'collection.purge');
    expect(purges.map((job) => (job.data as { collectionId: string }).collectionId)).toEqual([
      due.c.id,
    ]);
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { targetId: due.c.id } });
    expect(audit).toMatchObject({ actorType: 'SYSTEM', action: 'collection.delete' });
    expect(audit.metadata).toMatchObject({ reason: 'retention', toStatus: 'DELETING' });
  });
});

describe('mails', () => {
  function mailer() {
    const m = new SmtpMailer(env);
    mailers.push(m);
    return m;
  }

  test('the deletion warning: the title, the Kyiv date and the billing link, in Ukrainian', async () => {
    const email = `olena-${randomUUID()}@example.com`;
    const olena = await owner(trialEnded, email);
    const c = await collection(olena.id, 'Весілля Олени');
    await prisma.collection.update({
      where: { id: c.id },
      data: { deleteAfter: at('2027-07-14T22:30:00Z') },
    });
    await new BillingDeletionWarningMailHandler(prisma, mailer(), env).handle({
      collectionId: c.id,
      days: 30,
    });
    const [message] = await waitForMessages(email);
    expect(message?.Subject).toBe(
      'Stepler: колекцію «Весілля Олени» буде видалено 15 липня 2027 р.',
    );
    const text = await messageText(message?.ID ?? '');
    expect(text).toContain('http://localhost:3000/app/billing');
  });

  test('the read-only mail goes only while the account is read-only', async () => {
    const email = `olena-${randomUUID()}@example.com`;
    // The mail handler reads the real clock.
    const ended = new Date(Date.now() - DAY_MS);
    const olena = await owner(ended, email);
    await collection(olena.id);
    await clock().run(new Date());
    const handler = new BillingReadOnlyMailHandler(prisma, resolver, mailer(), env);
    await handler.handle({ userId: olena.id });
    const [message] = await waitForMessages(email);
    expect(message?.Subject).toBe('Stepler: колекції доступні лише для перегляду');
    expect(await messageText(message?.ID ?? '')).toContain('Пробний період завершився.');

    const iryna = `iryna-${randomUUID()}@example.com`;
    const granted = await owner(ended, iryna);
    await collection(granted.id);
    await grantTestPlan(prisma, granted.id);
    await handler.handle({ userId: granted.id });
    expect(await waitForMessages(iryna, 1, 300)).toEqual([]);
  });
});
