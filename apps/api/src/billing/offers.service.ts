import { Injectable, Logger } from '@nestjs/common';
import type {
  OfferCreate,
  OfferUpsert,
  OperatorOffer,
  PriceDeactivate,
  PriceSet,
} from '@stepler/contracts';
import { AuditService } from '../audit/audit.service.js';
import type { OperatorPrincipal } from '../auth/principal.js';
import { constraintViolation } from '../database/constraint-violation.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { BillingOffer, Prisma } from '../generated/prisma/client.js';
import { toOperatorOffer } from './billing-dto.js';

type Db = Prisma.TransactionClient;

const WITH_LIVE_PRICES = {
  prices: { where: { active: true }, orderBy: [{ interval: 'asc' as const }] },
};

/** The periods each kind is sold in: one-time for packs, monthly or yearly for plans. */
const INTERVALS_BY_KIND: Record<BillingOffer['kind'], readonly string[]> = {
  TRIAL: [],
  PACK: ['ONE_TIME'],
  PACK_EXTENSION: ['ONE_TIME'],
  SUBSCRIPTION: ['MONTH', 'YEAR'],
};

const bytes = (value: string | null): bigint | null => (value === null ? null : BigInt(value));

function editable(body: OfferUpsert) {
  return {
    titleUk: body.titleUk,
    titleEn: body.titleEn,
    descriptionUk: body.descriptionUk,
    descriptionEn: body.descriptionEn,
    rank: body.rank,
    highlighted: body.highlighted,
    ribbonUk: body.ribbonUk,
    ribbonEn: body.ribbonEn,
    activeCollections: body.activeCollections,
    storageBytes: bytes(body.storageBytes),
    collectionStorageBytes: bytes(body.collectionStorageBytes),
    guestLinks: body.guestLinks,
    windowDays: body.windowDays,
    retentionDays: body.retentionDays,
    durationDays: body.durationDays,
    rroItemId: body.rroItemId,
  };
}

/** A database rule the form broke, as a `400` the console can show next to the form. */
function asValidation(error: unknown): never {
  const violation = constraintViolation(error);
  if (violation?.kind === 'check' && violation.constraint.startsWith('BillingOffer_')) {
    throw new AppError('VALIDATION_FAILED', 400, {
      errors: [{ path: ['limits'], message: `Breaks ${violation.constraint}` }],
    });
  }
  if (violation?.kind === 'unique' && violation.constraint === 'BillingOffer_code_key') {
    throw new AppError('VALIDATION_FAILED', 400, {
      errors: [{ path: ['code'], message: 'An offer with this code exists' }],
    });
  }
  throw error;
}

/**
 * The offers and prices editor in /ops (owner decision B10, plan Task 20). Offers are created
 * inactive and are deactivated, never deleted; `code` and `kind` never change. Which limits a kind
 * needs is the database's rule (`BillingOffer_kind_shape`), returned as `400`. A price change
 * deactivates the slot's live row and inserts a new one in one transaction, so payments and
 * subscriptions keep pointing at the price they were made with. Nothing already bought changes:
 * purchases are snapshots. The trial is the exception by design: its limits are read live from
 * the `TRIAL` offer, so editing it changes every running trial (the trial is not a purchase).
 * Every change carries the operator's reason and is audited.
 */
@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(op: OperatorPrincipal, body: OfferCreate, requestId?: string) {
    if ((body.kind === 'PACK_EXTENSION') !== (body.extension !== null)) {
      throw new AppError('VALIDATION_FAILED', 400, {
        errors: [{ path: ['extension'], message: 'Only a pack extension names what it extends' }],
      });
    }
    const row = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.billingOffer.create({
          data: {
            code: body.code,
            kind: body.kind,
            extension: body.extension,
            active: false,
            ...editable(body),
          },
        });
        await this.record(
          tx,
          op,
          'billing.offer_create',
          created.id,
          {
            code: body.code,
            kind: body.kind,
            reason: body.reason,
          },
          requestId,
        );
        return created;
      })
      .catch(asValidation);
    this.logger.log({ msg: 'billing.offer_create', offerId: row.id });
    return this.view(row.id);
  }

  async update(op: OperatorPrincipal, id: string, body: OfferUpsert, requestId?: string) {
    await this.prisma
      .$transaction(async (tx) => {
        const before = await this.lockOffer(tx, id);
        await tx.billingOffer.update({ where: { id }, data: editable(body) });
        await this.record(
          tx,
          op,
          'billing.offer_update',
          id,
          {
            code: before.code,
            reason: body.reason,
          },
          requestId,
        );
      })
      .catch(asValidation);
    this.logger.log({ msg: 'billing.offer_update', offerId: id });
    return this.view(id);
  }

  /**
   * On sale or off sale. Off sale: gone from the catalogue, new checkouts `409 OFFER_UNAVAILABLE`,
   * nothing bought changes. The trial cannot be switched off (every new account needs it).
   */
  async setActive(
    op: OperatorPrincipal,
    id: string,
    active: boolean,
    reason: string,
    requestId?: string,
  ): Promise<OperatorOffer> {
    await this.prisma.$transaction(async (tx) => {
      const offer = await this.lockOffer(tx, id);
      if (offer.kind === 'TRIAL' && !active) {
        throw new AppError('VALIDATION_FAILED', 400, {
          errors: [{ path: ['active'], message: 'The trial offer cannot be switched off' }],
        });
      }
      if (offer.active === active) return;
      await tx.billingOffer.update({ where: { id }, data: { active } });
      await this.record(
        tx,
        op,
        active ? 'billing.offer_activate' : 'billing.offer_deactivate',
        id,
        { code: offer.code, reason },
        requestId,
      );
    });
    return this.view(id);
  }

  /** Stops selling one slot (a period in a currency); none live there → `404`. */
  async deactivatePrice(
    op: OperatorPrincipal,
    id: string,
    body: PriceDeactivate,
    requestId?: string,
  ): Promise<OperatorOffer> {
    await this.prisma.$transaction(async (tx) => {
      const offer = await this.lockOffer(tx, id);
      const current = await tx.billingPrice.findFirst({
        where: { offerId: id, interval: body.interval, currency: body.currency, active: true },
      });
      if (current === null) throw new AppError('NOT_FOUND', 404);
      await tx.billingPrice.update({ where: { id: current.id }, data: { active: false } });
      await this.record(
        tx,
        op,
        'billing.price_deactivate',
        id,
        {
          code: offer.code,
          interval: body.interval,
          currency: body.currency,
          oldAmountMinor: current.amountMinor,
          reason: body.reason,
        },
        requestId,
      );
    });
    this.logger.log({ msg: 'billing.price_deactivate', offerId: id, interval: body.interval });
    return this.view(id);
  }

  /** The live price of one slot; the same amount again changes nothing. */
  async setPrice(
    op: OperatorPrincipal,
    id: string,
    body: PriceSet,
    requestId?: string,
  ): Promise<OperatorOffer> {
    await this.prisma.$transaction(async (tx) => {
      const offer = await this.lockOffer(tx, id);
      if (!INTERVALS_BY_KIND[offer.kind].includes(body.interval)) {
        throw new AppError('VALIDATION_FAILED', 400, {
          errors: [
            {
              path: ['interval'],
              message: `A ${offer.kind} offer is not sold per ${body.interval}`,
            },
          ],
        });
      }
      if (offer.kind === 'PACK_EXTENSION' && offer.extension === 'STORAGE') {
        throw new AppError('VALIDATION_FAILED', 400, {
          errors: [{ path: ['interval'], message: 'A storage upgrade costs the tier difference' }],
        });
      }
      const current = await tx.billingPrice.findFirst({
        where: { offerId: id, interval: body.interval, currency: body.currency, active: true },
      });
      if (current?.amountMinor === body.amountMinor) return;
      if (current !== null) {
        await tx.billingPrice.update({ where: { id: current.id }, data: { active: false } });
      }
      await tx.billingPrice.create({
        data: {
          offerId: id,
          interval: body.interval,
          currency: body.currency,
          amountMinor: body.amountMinor,
        },
      });
      await this.record(
        tx,
        op,
        'billing.price_set',
        id,
        {
          code: offer.code,
          interval: body.interval,
          currency: body.currency,
          oldAmountMinor: current?.amountMinor ?? null,
          newAmountMinor: body.amountMinor,
          reason: body.reason,
        },
        requestId,
      );
    });
    this.logger.log({ msg: 'billing.price_set', offerId: id, interval: body.interval });
    return this.view(id);
  }

  async view(id: string): Promise<OperatorOffer> {
    const row = await this.prisma.billingOffer.findUnique({
      where: { id },
      include: WITH_LIVE_PRICES,
    });
    if (row === null) throw new AppError('NOT_FOUND', 404);
    return toOperatorOffer(row);
  }

  private async lockOffer(tx: Db, id: string): Promise<BillingOffer> {
    await tx.$queryRaw`SELECT 1 FROM "BillingOffer" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const offer = await tx.billingOffer.findUnique({ where: { id } });
    if (offer === null) throw new AppError('NOT_FOUND', 404);
    return offer;
  }

  private record(
    tx: Db,
    op: OperatorPrincipal,
    action:
      | 'billing.offer_create'
      | 'billing.offer_update'
      | 'billing.offer_activate'
      | 'billing.offer_deactivate'
      | 'billing.price_set'
      | 'billing.price_deactivate',
    offerId: string,
    metadata: Record<string, string | number | null>,
    requestId?: string,
  ): Promise<void> {
    return this.audit.record(tx, {
      actor: op,
      action,
      targetType: 'offer',
      targetId: offerId,
      metadata,
      ...(requestId === undefined ? {} : { requestId }),
    });
  }
}
