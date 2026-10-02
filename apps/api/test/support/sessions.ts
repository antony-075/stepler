import type { INestApplication } from '@nestjs/common';
import { SessionService } from '../../src/auth/session.service.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';

/** Creates a user and a session for them, skipping the sign-in flow. */
export async function signInAs(
  app: INestApplication,
  prisma: PrismaClient,
  email: string,
  verified = true,
): Promise<{ cookie: string; userId: string }> {
  const user = await prisma.user.create({
    data: { email, ...(verified ? { emailVerifiedAt: new Date() } : {}) },
  });
  const { token } = await app.get(SessionService).create(user.id);
  return { cookie: `st_session=${token}`, userId: user.id };
}
