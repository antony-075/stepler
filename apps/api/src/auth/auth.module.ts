import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LegalModule } from '../legal/legal.module.js';
import { LimitsService } from '../limits/limits.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { CsrfGuard } from './csrf.guard.js';
import { GoogleController } from './google/google.controller.js';
import { googleIdentityProvider } from './google/google-identity.js';
import { GoogleSignInService } from './google/google-sign-in.service.js';
import { MagicLinkController } from './magic-link.controller.js';
import { MagicLinkService } from './magic-link.service.js';
import { throttlerOptions } from './rate-limit.js';
import { SessionService } from './session.service.js';

@Module({
  imports: [
    LegalModule,
    ThrottlerModule.forRootAsync({ inject: [LimitsService], useFactory: throttlerOptions }),
  ],
  controllers: [AuthController, MagicLinkController, GoogleController],
  providers: [
    SessionService,
    MagicLinkService,
    GoogleSignInService,
    googleIdentityProvider,
    // Global guards run in registration order: CSRF first, then authentication.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [SessionService],
})
export class AuthModule {}
