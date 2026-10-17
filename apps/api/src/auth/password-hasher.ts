import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id at OWASP's first recommended setting (ADR 0019): 19 MiB, 2 passes, 1 lane. The
 * library's default algorithm is Argon2id; the stored PHC string carries the parameters, so a
 * later change applies to new and changed passwords and old hashes still verify.
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordHasher {
  /** Verified against for an unknown address, so its answer takes as long as a wrong password. */
  private readonly dummy = hash('stepler-no-such-account', OPTIONS);

  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  /** Constant-time comparison inside the library; a malformed stored hash is a mismatch. */
  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  /** The same work as `verify`, for an address without a password; always `false`. */
  async verifyNothing(password: string): Promise<false> {
    await this.verify(await this.dummy, password);
    return false;
  }
}
