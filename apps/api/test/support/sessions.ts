import type { INestApplication } from '@nestjs/common';
import { LEGAL_DOCUMENTS } from '@stepler/contracts';
import { SessionService } from '../../src/auth/session.service.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';

/**
 * Creates a user and a session for them, skipping the sign-in flow. By default the user has
 * accepted the current legal documents, as every sign-in through the card does (ADR 0016);
 * `legal = false` makes a pre-slice account that the acceptance gate stops.
 */
export async function signInAs(
  app: INestApplication,
  prisma: PrismaClient,
  email: string,
  verified = true,
  legal = true,
): Promise<{ cookie: string; userId: string }> {
  const user = await prisma.user.create({
    data: {
      email,
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
  const { token } = await app.get(SessionService).create(user.id);
  return { cookie: `st_session=${token}`, userId: user.id };
}
