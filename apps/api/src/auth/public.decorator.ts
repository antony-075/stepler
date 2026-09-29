import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'stepler:isPublic';
export const SKIP_ORIGIN_CHECK = 'stepler:skipOriginCheck';

/** Opts a route out of the default-deny `AuthGuard`. The CSRF origin check still applies. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/**
 * Opts an unsafe route out of the CSRF origin check. Only for server-to-server endpoints
 * (e.g. payment webhooks), which must authenticate by signature instead.
 */
export const SkipOriginCheck = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_ORIGIN_CHECK, true);
