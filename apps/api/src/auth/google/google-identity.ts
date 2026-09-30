import type { FactoryProvider } from '@nestjs/common';
import { decodeIdToken, Google } from 'arctic';
import { z } from 'zod';
import { API_ENV } from '../../config/config.module.js';
import type { ApiEnv } from '../../config/env.js';

/** Injection token for the `GoogleIdentity` port; `null` when Google sign-in is not configured. */
export const GOOGLE_IDENTITY = Symbol('GOOGLE_IDENTITY');

export interface GoogleClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

/** Google OpenID Connect (authorization code + PKCE) behind a port (rule 02). */
export interface GoogleIdentity {
  authorizationUrl(state: string, codeVerifier: string): URL;
  exchange(code: string, codeVerifier: string): Promise<GoogleClaims>;
}

export const GOOGLE_CALLBACK_PATH = '/api/v1/auth/google/callback';
const SCOPES = ['openid', 'email', 'profile'];

const idTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.email(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
});

export class ArcticGoogleIdentity implements GoogleIdentity {
  private readonly google: Google;

  constructor(clientId: string, clientSecret: string, appOrigin: string) {
    this.google = new Google(clientId, clientSecret, `${appOrigin}${GOOGLE_CALLBACK_PATH}`);
  }

  authorizationUrl(state: string, codeVerifier: string): URL {
    const url = this.google.createAuthorizationURL(state, codeVerifier, SCOPES);
    // Without it, Google silently signs in with the browser's current account; after signing
    // out of Stepler people could not choose another one (owner decision, 2026-09-30).
    url.searchParams.set('prompt', 'select_account');
    return url;
  }

  async exchange(code: string, codeVerifier: string): Promise<GoogleClaims> {
    const tokens = await this.google.validateAuthorizationCode(code, codeVerifier);
    // The id_token comes straight from Google's token endpoint over TLS, so decoding without
    // re-verifying its signature is what the OIDC code flow allows.
    const claims = idTokenClaimsSchema.parse(decodeIdToken(tokens.idToken()));
    return {
      sub: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified === true,
      ...(claims.name === undefined ? {} : { name: claims.name }),
    };
  }
}

export const googleIdentityProvider: FactoryProvider<GoogleIdentity | null> = {
  provide: GOOGLE_IDENTITY,
  inject: [API_ENV],
  useFactory: (env: ApiEnv) =>
    env.GOOGLE_CLIENT_ID === undefined || env.GOOGLE_CLIENT_SECRET === undefined
      ? null
      : new ArcticGoogleIdentity(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.APP_ORIGIN),
};
