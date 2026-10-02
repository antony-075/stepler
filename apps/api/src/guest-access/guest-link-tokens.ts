import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { generateToken, hashToken, TOKEN_PATTERN } from '../auth/tokens.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { deriveKey } from '../crypto/keys.js';

/** The only key id today: an HKDF subkey of APP_SECRET (G1). A rotated secret adds a second id. */
export const TOKEN_KEY_ID = 'app-secret-v1';

const IV_BYTES = 12;
const TAG_BYTES = 16;
const DECRYPT_FAILED = 'guest link token cannot be decrypted';

export interface IssuedGuestLinkToken {
  token: string;
  tokenHash: string;
  tokenCiphertext: string;
  tokenKeyId: typeof TOKEN_KEY_ID;
}

export interface StoredGuestLinkToken {
  tokenHash: string;
  tokenCiphertext: string | null;
  tokenKeyId: string | null;
}

/**
 * Guest link tokens (ADR 0007, spec §7.2): 32 random bytes in base64url. The database keeps the
 * SHA-256 hash for lookup and an AES-256-GCM ciphertext so the owner can see the link again.
 * Raw tokens never go to logs, audit metadata or error messages.
 */
@Injectable()
export class GuestLinkTokens {
  private readonly key: Buffer;
  private readonly origin: string;

  constructor(@Inject(API_ENV) env: Pick<ApiEnv, 'APP_SECRET' | 'APP_ORIGIN'>) {
    this.key = deriveKey(env.APP_SECRET, 'guest-link-token');
    this.origin = env.APP_ORIGIN;
  }

  generate(): IssuedGuestLinkToken {
    const token = generateToken();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return {
      token,
      tokenHash: hashToken(token),
      tokenCiphertext: Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString('base64url'),
      tokenKeyId: TOKEN_KEY_ID,
    };
  }

  /** The lookup hash, or `null` for input that cannot be a token (so it is a plain 404). */
  hashForLookup(input: string): string | null {
    return TOKEN_PATTERN.test(input) ? hashToken(input) : null;
  }

  /**
   * The raw token of a live link, or `null` for a revoked one. The decrypted token must hash to
   * the row's `tokenHash`, which binds the ciphertext to its row.
   */
  reveal(row: StoredGuestLinkToken): string | null {
    if (row.tokenCiphertext === null) return null;
    if (row.tokenKeyId !== TOKEN_KEY_ID) throw new Error(DECRYPT_FAILED);
    const bytes = Buffer.from(row.tokenCiphertext, 'base64url');
    if (bytes.length <= IV_BYTES + TAG_BYTES) throw new Error(DECRYPT_FAILED);
    let token: string;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, IV_BYTES));
      decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
      token = Buffer.concat([
        decipher.update(bytes.subarray(IV_BYTES, bytes.length - TAG_BYTES)),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // The cause (an auth-tag failure) carries no token, but nothing is passed on anyway.
      throw new Error(DECRYPT_FAILED);
    }
    if (hashToken(token) !== row.tokenHash) throw new Error(DECRYPT_FAILED);
    return token;
  }

  /** `{APP_ORIGIN}/g/{token}` (G2); the QR code encodes this URL. */
  urlFor(token: string): string {
    return `${this.origin}/g/${token}`;
  }
}
