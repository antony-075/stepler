import { Global, Module } from '@nestjs/common';
import { CloudflareTurnstileVerifier, TURNSTILE_VERIFIER } from './turnstile-verifier.js';

@Global()
@Module({
  providers: [{ provide: TURNSTILE_VERIFIER, useClass: CloudflareTurnstileVerifier }],
  exports: [TURNSTILE_VERIFIER],
})
export class TurnstileModule {}
