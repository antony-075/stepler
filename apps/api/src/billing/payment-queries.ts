import { Injectable } from '@nestjs/common';
import type {
  AccountPaymentListQuery,
  OfferDto,
  OfferList,
  PaymentDto,
  PaymentList,
} from '@stepler/contracts';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { BillingOffer, BillingPrice, Payment } from '../generated/prisma/client.js';
import { offerLimits } from './billing-dto.js';
import { readSnapshot, snapshotTitle } from './offer-snapshot.js';

export type Locale = 'uk' | 'en';

/** Explicit mapping; never a Prisma row as the contract (rule 06). */
export function toPaymentDto(row: Payment, locale: Locale): PaymentDto {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    amountMinor: row.amountMinor,
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    offerTitle: snapshotTitle(readSnapshot(row.offerSnapshot), locale),
    collectionId: row.collectionId,
    refundedMinor: row.refundedMinor,
  };
}

export function toOfferDto(
  row: BillingOffer & { prices: BillingPrice[] },
  locale: Locale,
): OfferDto {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    extension: row.extension,
    title: locale === 'en' ? row.titleEn : row.titleUk,
    description: (locale === 'en' ? row.descriptionEn : row.descriptionUk) ?? null,
    limits: offerLimits(row),
    rank: row.rank,
    prices: row.prices.map((price) => ({
      id: price.id,
      interval: price.interval,
      amountMinor: price.amountMinor,
      currency: price.currency,
    })),
  };
}

/** Reads of the account's own payments and of the public catalogue (ADR 0018). */
@Injectable()
export class PaymentQueries {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The public catalogue: active offers with at least one active price, best first per kind.
   * The trial is not sold; `rroItemId` and `features` never leave the server.
   */
  async offers(locale: Locale): Promise<OfferList> {
    const rows = await this.prisma.billingOffer.findMany({
      where: { active: true, kind: { not: 'TRIAL' }, prices: { some: { active: true } } },
      include: { prices: { where: { active: true }, orderBy: [{ interval: 'asc' }] } },
      orderBy: [{ kind: 'asc' }, { rank: 'asc' }, { code: 'asc' }],
    });
    return { items: rows.map((row) => toOfferDto(row, locale)) };
  }

  /** Newest first, keyset over `(createdAt, id)` (ADR 0004); only the account's own rows. */
  async list(userId: string, query: AccountPaymentListQuery, locale: Locale): Promise<PaymentList> {
    const position = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    if (position === null) {
      throw new AppError('VALIDATION_FAILED', 400, {
        errors: [{ path: ['cursor'], message: 'Invalid cursor' }],
      });
    }
    const rows = await this.prisma.payment.findMany({
      where: {
        userId,
        ...(position === undefined
          ? {}
          : {
              OR: [
                { createdAt: { lt: position.createdAt } },
                { createdAt: position.createdAt, id: { lt: position.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return {
      items: items.map((row) => toPaymentDto(row, locale)),
      nextCursor: rows.length > query.limit && last !== undefined ? encodeCursor(last) : null,
    };
  }

  /** Another account's payment is `404`, like an unknown one. */
  async ownPayment(userId: string, paymentId: string): Promise<Payment> {
    const row = await this.prisma.payment.findFirst({ where: { id: paymentId, userId } });
    if (row === null) throw new AppError('NOT_FOUND', 404);
    return row;
  }

  async localeOf(userId: string): Promise<Locale> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true },
    });
    return user?.locale ?? 'uk';
  }
}
