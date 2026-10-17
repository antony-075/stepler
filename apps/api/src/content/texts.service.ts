import { EntitlementGate } from '../billing/entitlement-gate.js';
import { Injectable } from '@nestjs/common';
import type { GuestContentItem } from '@stepler/contracts';
import type { GuestPrincipal } from '../auth/principal.js';
import { constraintViolation } from '../database/constraint-violation.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { ContentItem as ContentItemRow } from '../generated/prisma/client.js';
import { canSubmitText } from '../guest-access/guest-policy.js';
import { LimitsService } from '../limits/limits.service.js';
import { toGuestContentItem } from './content-dto.js';
import { FrameNumbers } from './frame-numbers.js';

const HOUR_MS = 3600_000;
const IDEMPOTENCY_INDEX = 'ContentItem_contributorGuestSessionId_idempotencyKey_key';

/** Guest text wishes (D5, [O2]): plain text, numbered like every frame. */
@Injectable()
export class TextsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly frames: FrameNumbers,
    private readonly gate: EntitlementGate,
  ) {}

  /**
   * Creates the text once per `idempotencyKey`: a retry with the same body returns the same item
   * (`created: false`), a different body is `409 IDEMPOTENCY_CONFLICT`.
   */
  async create(
    p: GuestPrincipal,
    body: string,
    idempotencyKey: string,
  ): Promise<{ item: GuestContentItem; created: boolean }> {
    if (!canSubmitText(p)) throw new AppError('FORBIDDEN', 403);

    const replay = await this.findReplay(p, idempotencyKey, body);
    if (replay !== null) return { item: toGuestContentItem(replay, p), created: false };

    await this.assertWithinHourlyLimit(p);

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await this.gate.assertGuestCanContribute(p.collectionId, tx);
        const frameNo = await this.frames.next(tx, p.collectionId);
        const session = await tx.guestSession.findUniqueOrThrow({
          where: { id: p.guestSessionId },
          select: { contributorName: true },
        });
        return tx.contentItem.create({
          data: {
            collectionId: p.collectionId,
            frameNo,
            kind: 'TEXT',
            contributorGuestSessionId: p.guestSessionId,
            contributorName: session.contributorName,
            textBody: body,
            idempotencyKey,
            processingStatus: 'NOT_REQUIRED',
          },
        });
      });
      return { item: toGuestContentItem(row, p), created: true };
    } catch (error) {
      // A concurrent request with the same key committed first; its transaction gave the frame
      // number, ours rolled back.
      if (constraintViolation(error)?.constraint !== IDEMPOTENCY_INDEX) throw error;
      const winner = await this.findReplay(p, idempotencyKey, body);
      if (winner === null) throw error;
      return { item: toGuestContentItem(winner, p), created: false };
    }
  }

  private async findReplay(
    p: GuestPrincipal,
    idempotencyKey: string,
    body: string,
  ): Promise<ContentItemRow | null> {
    const existing = await this.prisma.contentItem.findUnique({
      where: {
        contributorGuestSessionId_idempotencyKey: {
          contributorGuestSessionId: p.guestSessionId,
          idempotencyKey,
        },
      },
    });
    if (existing === null) return null;
    if (existing.textBody !== body) throw new AppError('IDEMPOTENCY_CONFLICT', 409);
    // Deleted or hidden meanwhile: a retry must not hand the guest an item they may not see.
    if (
      existing.deletedAt !== null ||
      existing.hiddenAt !== null ||
      existing.quarantinedAt !== null
    ) {
      throw new AppError('CONTENT_NOT_FOUND', 404);
    }
    return existing;
  }

  /**
   * Texts this session created in the last hour, deleted ones included (deleting must not
   * reset the limit). Concurrent requests may overshoot by their number; a bound on load, not
   * a quota.
   */
  private async assertWithinHourlyLimit(p: GuestPrincipal): Promise<void> {
    const since = new Date(Date.now() - HOUR_MS);
    const recent = await this.prisma.contentItem.aggregate({
      where: {
        contributorGuestSessionId: p.guestSessionId,
        kind: 'TEXT',
        createdAt: { gt: since },
      },
      _count: { _all: true },
      _min: { createdAt: true },
    });
    if (recent._count._all < this.limits.forGuestSession().textsPerHour) return;
    const oldest = recent._min.createdAt?.getTime() ?? Date.now();
    throw new AppError('RATE_LIMITED', 429, {
      retryable: true,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + HOUR_MS - Date.now()) / 1000)),
    });
  }
}
