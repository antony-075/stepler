import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { z } from 'zod';
import type { RequestWithPrincipal } from '../auth/principal.js';
import { readCookie } from '../auth/session-cookie.js';
import { AppError } from '../errors/app-error.js';
import { GUEST_SESSION_COOKIE } from './guest-session-cookie.js';
import { GuestSessionsService } from './guest-sessions.service.js';

const collectionIdSchema = z.uuid();

type GuestRequest = RequestWithPrincipal & {
  params?: Record<string, string | undefined>;
  guestLinkClosed?: AppError | null;
};

const ALLOW_CLOSED_LINK = 'guest:allow-closed-link';

/**
 * The route still runs when the session's link or collection no longer accepts guests; the
 * handler gets that state through `@GuestLinkClosed()` and must act on it (upload completion
 * and cancel). The session itself must still be valid.
 */
export const AllowClosedLink = (): MethodDecorator => SetMetadata(ALLOW_CLOSED_LINK, true);

/** The link or collection state that `@AllowClosedLink()` let through, or `null`. */
export const GuestLinkClosed = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AppError | null =>
    context.switchToHttp().getRequest<GuestRequest>().guestLinkClosed ?? null,
);

/**
 * Guest collection routes (`/guest/collections/:collectionId/…`, `@Public()` for the admin
 * guard): the `st_gs` cookie must belong to a session of that collection, whose current link and
 * collection are usable right now. Sets `req.principal` to the guest principal.
 */
@Injectable()
export class GuestSessionGuard implements CanActivate {
  constructor(
    private readonly sessions: GuestSessionsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<GuestRequest>();
    const collectionId = req.params?.collectionId;
    if (collectionId === undefined || !collectionIdSchema.safeParse(collectionId).success) {
      throw new AppError('NOT_FOUND', 404);
    }
    const cookie = readCookie(req, GUEST_SESSION_COOKIE);
    if (this.reflector.get<boolean>(ALLOW_CLOSED_LINK, context.getHandler()) === true) {
      const { principal, closed } = await this.sessions.identify(collectionId, cookie);
      req.principal = principal;
      req.guestLinkClosed = closed;
      return true;
    }
    req.principal = await this.sessions.authenticate(collectionId, cookie);
    return true;
  }
}
