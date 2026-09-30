import { describe, expect, test } from 'vitest';
import { ArcticGoogleIdentity, GOOGLE_CALLBACK_PATH } from './google-identity.js';

describe('ArcticGoogleIdentity.authorizationUrl', () => {
  const google = new ArcticGoogleIdentity('client-id', 'client-secret', 'http://localhost:3000');
  const url = google.authorizationUrl('state-123', 'verifier-'.padEnd(43, 'x'));
  const q = url.searchParams;

  test('targets Google with our callback, OIDC scopes and PKCE (S256)', () => {
    expect(url.origin).toBe('https://accounts.google.com');
    expect(q.get('client_id')).toBe('client-id');
    expect(q.get('redirect_uri')).toBe(`http://localhost:3000${GOOGLE_CALLBACK_PATH}`);
    expect(q.get('response_type')).toBe('code');
    expect(q.get('scope')?.split(' ').sort()).toEqual(['email', 'openid', 'profile']);
    expect(q.get('state')).toBe('state-123');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test('always shows the account chooser, so a signed-out user can pick another account', () => {
    expect(q.get('prompt')).toBe('select_account');
  });
});
