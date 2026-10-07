import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { PgBossClient, PgBossQueue, senderBossOptions } from '../src/jobs/pg-boss-queue.js';
import { SmtpMailer } from '../src/mail/smtp-mailer.js';
import { AuditService } from '../src/audit/audit.service.js';
import { ContentDeletion } from '../src/content/content-deletion.js';
import { MaintenanceSweepHandler } from '../src/worker/handlers/maintenance-sweep.handler.js';
import { ReportDecisionMailHandler } from '../src/worker/handlers/report-decision-mail.handler.js';
import { ReportReceivedMailHandler } from '../src/worker/handlers/report-received-mail.handler.js';
import { loadWorkerEnv, type WorkerEnv } from '../src/worker/worker-env.js';
import { resetDatabase } from './support/database.js';
import { TEST_DATABASE_URL, testEnv, WORKER_MAIL_ENV } from './support/env.js';
import { messagesAfter, messageText, waitForMessages } from './support/mailpit.js';

// Slice 9 plan, Task 6: the report mail sent by the worker ([P1], R6), retry-safe, and the
// reporter's address deleted once it has served ([Q6]).

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
    ...overrides,
  });

const base = workerEnv();
const prisma = new PrismaService(base);
const boss = new PgBossClient(senderBossOptions(TEST_DATABASE_URL));
const queue = new PgBossQueue(boss);
const mailers: SmtpMailer[] = [];

/** A mailer for `env`, closed after the file. */
function mailerFor(env: WorkerEnv): SmtpMailer {
  const mailer = new SmtpMailer(env);
  mailers.push(mailer);
  return mailer;
}

const DAY_MS = 24 * 3600_000;

async function seedReport(fields: Record<string, unknown> = {}) {
  return prisma.contentReport.create({
    data: {
      contentId: randomUUID(),
      collectionId: randomUUID(),
      reporterGuestSessionId: randomUUID(),
      idempotencyKey: randomUUID(),
      reason: 'PRIVACY',
      description: 'Це я на фото',
      ...fields,
    },
  });
}

/** The report decided as the operator does it (the CHECK needs all three). */
const decided = (status: 'ACTIONED' | 'DISMISSED') => ({
  status,
  resolvedAt: new Date(),
  resolvedByUserId: randomUUID(),
  resolutionNote: 'Перевірено',
});

describe('report mail in the worker', () => {
  beforeAll(async () => {
    await boss.start();
  });

  afterAll(async () => {
    await boss.stop();
    for (const mailer of mailers) mailer.onModuleDestroy();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  test('«нова скарга» to each operator address once, with the console link only', async () => {
    const op1 = `op1-${randomUUID()}@stepler.test`;
    const op2 = `op2-${randomUUID()}@stepler.test`;
    const env = workerEnv({ OPERATOR_EMAILS: `${op1},${op2}` });
    const handler = new ReportReceivedMailHandler(prisma, mailerFor(env), env);
    const report = await seedReport({ reporterEmail: 'r@stepler.test', reporterLocale: 'en' });

    await handler.handle({ reportId: report.id });
    for (const to of [op1, op2]) {
      const [message] = await waitForMessages(to);
      expect(message?.Subject).toBe('Stepler: нова скарга (Порушує приватність)');
      const text = await messageText(message?.ID ?? '');
      expect(text).toContain(`http://localhost:3000/ops/reports/${report.id}`);
      expect(text).not.toContain('r@stepler.test');
      expect(text).not.toContain('Це я на фото');
    }
    const row = await prisma.contentReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(row.operatorNotifiedAt).not.toBeNull();

    // A rerun (a retried or duplicated job) sends nothing.
    await handler.handle({ reportId: report.id });
    expect(await messagesAfter(op1, 300)).toHaveLength(1);
  });

  test('an SMTP outage: the job fails without naming anyone, nothing is stamped; a rerun sends once', async () => {
    const op = `op-${randomUUID()}@stepler.test`;
    const down = workerEnv({ OPERATOR_EMAILS: op, SMTP_URL: 'smtp://127.0.0.1:9' });
    const report = await seedReport();
    const error = await new ReportReceivedMailHandler(prisma, mailerFor(down), down)
      .handle({ reportId: report.id })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('@');
    expect(
      (await prisma.contentReport.findUniqueOrThrow({ where: { id: report.id } }))
        .operatorNotifiedAt,
    ).toBeNull();

    const up = workerEnv({ OPERATOR_EMAILS: op });
    await new ReportReceivedMailHandler(prisma, mailerFor(up), up).handle({ reportId: report.id });
    expect(await waitForMessages(op)).toHaveLength(1);
    expect(await messagesAfter(op, 300)).toHaveLength(1);
  });

  test('no operator address: nothing sent, the report is stamped', async () => {
    const report = await seedReport();
    await new ReportReceivedMailHandler(prisma, mailerFor(base), base).handle({
      reportId: report.id,
    });
    expect(
      (await prisma.contentReport.findUniqueOrThrow({ where: { id: report.id } }))
        .operatorNotifiedAt,
    ).not.toBeNull();
  });

  test('the decision to the reporter in their language, then the address is gone', async () => {
    const reporter = `r-${randomUUID()}@stepler.test`;
    const env = workerEnv({ LEGAL_CONTACT_EMAIL: 'legal@stepler.test' });
    const handler = new ReportDecisionMailHandler(prisma, mailerFor(env), env);
    const report = await seedReport({
      reporterEmail: reporter,
      reporterLocale: 'en',
      ...decided('ACTIONED'),
    });

    await handler.handle({ reportId: report.id });
    const [message] = await waitForMessages(reporter);
    expect(message?.Subject).toBe('Stepler: your report has been reviewed');
    const text = await messageText(message?.ID ?? '');
    expect(text).toContain('We reviewed your report and took action.');
    expect(text).toContain('legal@stepler.test');
    expect(text).not.toContain('Перевірено');
    expect(
      await prisma.contentReport.findUniqueOrThrow({ where: { id: report.id } }),
    ).toMatchObject({
      reporterEmail: null,
      reporterLocale: null,
      reporterNotifiedAt: expect.any(Date) as Date,
    });

    await handler.handle({ reportId: report.id });
    expect(await messagesAfter(reporter, 300)).toHaveLength(1);
  });

  test('no decision mail without an address, or while the report is open', async () => {
    const reporter = `r-${randomUUID()}@stepler.test`;
    const handler = new ReportDecisionMailHandler(prisma, mailerFor(base), base);
    const open = await seedReport({ reporterEmail: reporter, reporterLocale: 'uk' });
    const anonymous = await seedReport(decided('DISMISSED'));
    await handler.handle({ reportId: open.id });
    await handler.handle({ reportId: anonymous.id });
    await handler.handle({ reportId: randomUUID() });
    expect(await messagesAfter(reporter, 300)).toHaveLength(0);
    expect(
      (await prisma.contentReport.findUniqueOrThrow({ where: { id: open.id } })).reporterEmail,
    ).toBe(reporter);
  });

  test('the sweep deletes addresses older than the retention, and only those', async () => {
    const old = await seedReport({
      reporterEmail: 'old@stepler.test',
      reporterLocale: 'uk',
      createdAt: new Date(Date.now() - 91 * DAY_MS),
    });
    const recent = await seedReport({
      reporterEmail: 'recent@stepler.test',
      reporterLocale: 'uk',
      createdAt: new Date(Date.now() - 89 * DAY_MS),
    });
    await new MaintenanceSweepHandler(
      prisma,
      new ContentDeletion(new AuditService(), queue),
      queue,
      base,
    ).handle();
    expect(await prisma.contentReport.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({
      reporterEmail: null,
      reporterLocale: null,
    });
    expect(
      (await prisma.contentReport.findUniqueOrThrow({ where: { id: recent.id } })).reporterEmail,
    ).toBe('recent@stepler.test');
  });
});
