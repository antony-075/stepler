import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { RequestWithPrincipal } from '../auth/principal.js';
import { readCookie } from '../auth/session-cookie.js';
import { AppError } from '../errors/app-error.js';
import { GUEST_SESSION_COOKIE } from './guest-session-cookie.js';
import { GuestSessionsService } from './guest-sessions.service.js';

const collectionIdSchema = z.uuid();

type GuestRequest = RequestWithPrincipal & { params?: Record<string, string | undefined> };

/**
 * Guest collection routes (`/guest/collections/:collectionId/…`, `@Public()` for the admin
 * guard): the `st_gs` cookie must belong to a session of that collection, whose current link and
 * collection are usable right now. Sets `req.principal` to the guest principal.
 */
@Injectable()
export class GuestSessionGuard implements CanActivate {
  constructor(private readonly sessions: GuestSessionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<GuestRequest>();
    const collectionId = req.params?.collectionId;
    if (collectionId === undefined || !collectionIdSchema.safeParse(collectionId).success) {
      throw new AppError('NOT_FOUND', 404);
    }
    req.principal = await this.sessions.authenticate(
      collectionId,
      readCookie(req, GUEST_SESSION_COOKIE),
    );
    return true;
  }
}
