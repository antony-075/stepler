import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { SmtpMailer } from '../src/mail/smtp-mailer.js';
import { AppealReceivedMailHandler } from '../src/worker/handlers/appeal-received-mail.handler.js';
import { loadWorkerEnv, type WorkerEnv } from '../src/worker/worker-env.js';
import { resetDatabase } from './support/database.js';
import { TEST_DATABASE_URL, testEnv, WORKER_MAIL_ENV } from './support/env.js';
import { messagesAfter, messageText, waitForMessages } from './support/mailpit.js';

// Slice 9b plan, Task 4: the operator's «нова апеляція» mail, once per appeal, with the console
// link and never the admin's text.

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

const prisma = new PrismaService(workerEnv());
const mailers: SmtpMailer[] = [];

describe('appeal mail in the worker', () => {
  afterAll(async () => {
    for (const mailer of mailers) mailer.onModuleDestroy();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  test('«нова апеляція» to each operator address once, with the console link only', async () => {
    const op1 = `op1-${randomUUID()}@stepler.test`;
    const op2 = `op2-${randomUUID()}@stepler.test`;
    const env = workerEnv({ OPERATOR_EMAILS: `${op1},${op2}` });
    const mailer = new SmtpMailer(env);
    mailers.push(mailer);
    const handler = new AppealReceivedMailHandler(prisma, mailer, env);
    const appeal = await prisma.moderationAppeal.create({
      data: {
        collectionId: randomUUID(),
        targetType: 'COLLECTION',
        targetId: randomUUID(),
        submittedByUserId: randomUUID(),
        text: 'Це помилка, перевірте ще раз',
      },
    });

    await handler.handle({ appealId: appeal.id });
    for (const to of [op1, op2]) {
      const [message] = await waitForMessages(to);
      expect(message?.Subject).toBe('Stepler: нова апеляція (колекція)');
      const text = await messageText(message?.ID ?? '');
      expect(text).toContain(`http://localhost:3000/ops/appeals/${appeal.id}`);
      expect(text).not.toContain('Це помилка');
    }
    const row = await prisma.moderationAppeal.findUniqueOrThrow({ where: { id: appeal.id } });
    expect(row.operatorNotifiedAt).not.toBeNull();

    // A rerun (a retried or duplicated job) sends nothing; an unknown appeal neither.
    await handler.handle({ appealId: appeal.id });
    await handler.handle({ appealId: randomUUID() });
    expect(await messagesAfter(op1, 300)).toHaveLength(1);
  });
});
