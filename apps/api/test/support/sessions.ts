import type { INestApplication } from '@nestjs/common';
import { LEGAL_DOCUMENTS } from '@stepler/contracts';
import { PasswordHasher } from '../../src/auth/password-hasher.js';
import { SessionService } from '../../src/auth/session.service.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { freshTrialEnd, grantTestPlan } from './billing.js';

/**
 * Creates a user and a session for them, skipping the sign-in flow. By default the user has
 * accepted the current legal documents, as every sign-in through the card does (ADR 0016);
 * `legal = false` makes a pre-slice account that the acceptance gate stops.
 *
 * Like a real sign-up, the account starts a 7-day trial (ADR 0018). Unless `plan` is `'trial'`,
 * it also gets a complimentary plan with the pre-billing limits (`TEST_PLAN_LIMITS`), so suites
 * that are not about entitlements are not bound by the trial's 1 collection and 1 GiB.
 */
/** Gives the user a password (Argon2id, as the API stores it) for the e-mail + password routes. */
export async function givePassword(
  app: INestApplication,
  prisma: PrismaClient,
  userId: string,
  password: string,
): Promise<void> {
  const passwordHash = await app.get(PasswordHasher).hash(password);
  await prisma.passwordCredential.create({ data: { userId, passwordHash } });
}

export async function signInAs(
  app: INestApplication,
  prisma: PrismaClient,
  email: string,
  verified = true,
  legal = true,
  plan: 'test' | 'trial' = 'test',
): Promise<{ cookie: string; userId: string }> {
  const user = await prisma.user.create({
    data: {
      email,
      trialEndsAt: freshTrialEnd(),
      ...(verified ? { emailVerifiedAt: new Date() } : {}),
      ...(legal
        ? {
            legalAcceptances: {
              create: LEGAL_DOCUMENTS.map(({ document, version }) => ({ document, version })),
            },
          }
        : {}),
    },
  });
  if (plan === 'test') await grantTestPlan(prisma, user.id);
  const { token } = await app.get(SessionService).create(user.id);
  return { cookie: `st_session=${token}`, userId: user.id };
}
