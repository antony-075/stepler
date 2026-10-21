import { Injectable } from '@nestjs/common';
import {
  type AccountPaymentListQuery,
  type OfferDto,
  type OfferList,
  PAYMENT_GROUP_KINDS,
  type PaymentDto,
  type PaymentList,
  type PaymentTotals,
} from '@stepler/contracts';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { BillingOffer, BillingPrice, Payment } from '../generated/prisma/client.js';
import { offerLimits } from './billing-dto.js';
import { readSnapshot, snapshotTitle } from './offer-snapshot.js';
import { SALE_CURRENCY } from './sale-currency.js';

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
    highlighted: row.highlighted,
    ribbon: (locale === 'en' ? row.ribbonEn : row.ribbonUk) ?? null,
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

  /**
   * Newest first, keyset over `(createdAt, id)` (ADR 0004); only the account's own rows, of one
   * group when asked (`group`).
   */
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
        ...(query.group === undefined
          ? {}
          : { kind: { in: [...PAYMENT_GROUP_KINDS[query.group]] } }),
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

  /**
   * The history's chips and its year line: the account's payments per group, and what it paid
   * in the current calendar year in Kyiv (succeeded and partly refunded payments, less refunds).
   */
  async totals(userId: string, now: Date = new Date()): Promise<PaymentTotals> {
    const year = kyivYear(now);
    const [byKind, paid] = await Promise.all([
      this.prisma.payment.groupBy({ by: ['kind'], where: { userId }, _count: { _all: true } }),
      this.prisma.payment.aggregate({
        where: {
          userId,
          currency: SALE_CURRENCY,
          status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] },
          paidAt: { gte: kyivYearStart(year), lt: kyivYearStart(year + 1) },
        },
        _sum: { amountMinor: true, refundedMinor: true },
      }),
    ]);
    const count = (kinds: readonly string[]) =>
      byKind.filter((row) => kinds.includes(row.kind)).reduce((n, row) => n + row._count._all, 0);
    return {
      counts: {
        all: byKind.reduce((n, row) => n + row._count._all, 0),
        SUBSCRIPTION: count(PAYMENT_GROUP_KINDS.SUBSCRIPTION),
        PACK: count(PAYMENT_GROUP_KINDS.PACK),
      },
      year,
      paidThisYear: {
        amountMinor: (paid._sum.amountMinor ?? 0) - (paid._sum.refundedMinor ?? 0),
        currency: SALE_CURRENCY,
      },
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

const KYIV = 'Europe/Kyiv';

/** The calendar year in Kyiv at `now`. */
export function kyivYear(now: Date): number {
  return Number(new Intl.DateTimeFormat('en', { timeZone: KYIV, year: 'numeric' }).format(now));
}

/** Midnight of 1 January of `year` in Kyiv, as an instant (Kyiv is UTC+2 in winter). */
export function kyivYearStart(year: number): Date {
  return new Date(`${year}-01-01T00:00:00+02:00`);
}
