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
import { EmailTokens } from './email-tokens.service.js';
import { LoginFailures } from './login-failures.js';
import { PasswordAuthController } from './password-auth.controller.js';
import { PasswordAuthService } from './password-auth.service.js';
import { PasswordHasher } from './password-hasher.js';
import { throttlerOptions } from './rate-limit.js';
import { SessionService } from './session.service.js';

@Module({
  imports: [
    LegalModule,
    ThrottlerModule.forRootAsync({ inject: [LimitsService], useFactory: throttlerOptions }),
  ],
  controllers: [AuthController, PasswordAuthController, GoogleController],
  providers: [
    SessionService,
    PasswordAuthService,
    PasswordHasher,
    EmailTokens,
    LoginFailures,
    GoogleSignInService,
    googleIdentityProvider,
    // Global guards run in registration order: CSRF first, then authentication.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [SessionService, EmailTokens],
})
export class AuthModule {}
