import { Injectable } from '@nestjs/common';
import {
  currentLegalVersion,
  type LegalAcceptanceRequest,
  type LegalDocumentKey,
  type LegalStatus,
  legalStatus,
  type LegalVersions,
} from '@stepler/contracts';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { Prisma } from '../generated/prisma/client.js';

/** The acceptance rows `legalStatus` needs, selected wherever a status is computed. */
export const LEGAL_ACCEPTANCE_FIELDS = { document: true, version: true, acceptedAt: true } as const;

/** Rows as selected with `LEGAL_ACCEPTANCE_FIELDS`, to the contract's records. */
export function toAcceptanceRecords(
  rows: readonly { document: LegalDocumentKey; version: string; acceptedAt: Date }[],
) {
  return rows.map((row) => ({ ...row, acceptedAt: row.acceptedAt.toISOString() }));
}

/**
 * Acceptance of the legal documents (ADR 0016). One recording function for every path: the
 * magic-link verify and the Google callback (inside their sign-in transactions) and the fallback
 * endpoint. Only versions current at that moment are written, so a stale card or link records
 * nothing and the `AuthGuard` gate sends the user to the fallback page.
 */
@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  async statusFor(userId: string): Promise<LegalStatus> {
    const rows = await this.prisma.legalAcceptance.findMany({
      where: { userId },
      select: LEGAL_ACCEPTANCE_FIELDS,
    });
    return legalStatus(toAcceptanceRecords(rows));
  }

  /** Idempotent by `(userId, document, version)`; a version that is not current is skipped. */
  async recordAcceptance(
    tx: Prisma.TransactionClient,
    userId: string,
    versions: LegalVersions,
    requestId: string | undefined,
  ): Promise<void> {
    const offered: [LegalDocumentKey, string][] = [
      ['TERMS', versions.terms],
      ['PRIVACY', versions.privacy],
    ];
    await this.write(tx, userId, offered, requestId);
  }

  /**
   * The fallback endpoint: every version must be the current one, else `400
   * LEGAL_VERSION_OUTDATED` before any write (the client refetches and asks again).
   */
  async accept(
    userId: string,
    body: LegalAcceptanceRequest,
    requestId: string | undefined,
  ): Promise<void> {
    for (const { document, version } of body.acceptances) {
      if (currentLegalVersion(document).version !== version) {
        throw new AppError('LEGAL_VERSION_OUTDATED', 400);
      }
    }
    const offered = body.acceptances.map(({ document, version }): [LegalDocumentKey, string] => [
      document,
      version,
    ]);
    await this.prisma.$transaction((tx) => this.write(tx, userId, offered, requestId));
  }

  private async write(
    tx: Prisma.TransactionClient,
    userId: string,
    offered: readonly [LegalDocumentKey, string][],
    requestId: string | undefined,
  ): Promise<void> {
    const data = offered
      .filter(([document, version]) => currentLegalVersion(document).version === version)
      .map(([document, version]) => ({ userId, document, version, requestId: requestId ?? null }));
    if (data.length === 0) return;
    await tx.legalAcceptance.createMany({ data, skipDuplicates: true });
  }
}
