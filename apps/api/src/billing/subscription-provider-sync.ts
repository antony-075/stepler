import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from './provider/payment-provider.js';

/**
 * Tells LiqPay what our subscription state already decided (ADR 0018, plan Tasks 16–17): a new
 * price for the next charges (`subscribe_update`) and the end of charging (`unsubscribe`). Both
 * are best effort here: a provider error leaves the stamp unset and the reconcile job asks again.
 * Spike S1b: `subscribe_update` answers at once with status `subscribed` and the new amount, and
 * charges nothing now.
 */
@Injectable()
export class SubscriptionProviderSync {
  private readonly logger = new Logger(SubscriptionProviderSync.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /** Sends `pendingProviderAmountMinor`; `true` when nothing is left to send. */
  async syncAmount(subscriptionId: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        offer: { select: { titleUk: true, titleEn: true } },
        user: { select: { locale: true } },
      },
    });
    const amount = sub?.pendingProviderAmountMinor ?? null;
    if (sub === null || amount === null) return true;
    if (sub.providerOrderId === null || sub.currency === null || sub.providerUnsubscribedAt) {
      return true;
    }
    const title = sub.user.locale === 'en' ? sub.offer.titleEn : sub.offer.titleUk;
    try {
      const ev = await this.provider.updateSubscription(
        sub.providerOrderId,
        amount,
        sub.currency,
        `Stepler: ${title}`,
      );
      if (ev.outcome !== 'SUBSCRIBED' || ev.amountMinor !== amount) {
        this.logger.warn({
          msg: 'billing.subscription.update_refused',
          subscriptionId,
          rawStatus: ev.rawStatus,
          errCode: ev.errCode,
        });
        return false;
      }
    } catch {
      this.logger.warn({ msg: 'billing.subscription.update_failed', subscriptionId });
      return false;
    }
    await this.prisma.subscription.updateMany({
      where: { id: subscriptionId, pendingProviderAmountMinor: amount },
      data: { pendingProviderAmountMinor: null },
    });
    this.logger.log({ msg: 'billing.subscription.price_updated', subscriptionId });
    return true;
  }

  /**
   * Stops LiqPay's charges for an ended subscription and stamps `providerUnsubscribedAt`;
   * `true` once LiqPay confirms (or there is nothing to stop).
   */
  async unsubscribe(subscriptionId: string, now = new Date()): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (sub === null || sub.providerUnsubscribedAt !== null || sub.providerOrderId === null) {
      return true;
    }
    try {
      const ev = await this.provider.unsubscribe(sub.providerOrderId);
      // An order LiqPay already stopped may be refused; its `status` then says so.
      const stopped =
        ev.outcome === 'UNSUBSCRIBED' ||
        (await this.provider.status(sub.providerOrderId))?.outcome === 'UNSUBSCRIBED';
      if (!stopped) {
        this.logger.warn({
          msg: 'billing.subscription.unsubscribe_refused',
          subscriptionId,
          rawStatus: ev.rawStatus,
          errCode: ev.errCode,
        });
        return false;
      }
    } catch {
      this.logger.warn({ msg: 'billing.subscription.unsubscribe_failed', subscriptionId });
      return false;
    }
    await this.prisma.subscription.updateMany({
      where: { id: subscriptionId, providerUnsubscribedAt: null },
      data: { providerUnsubscribedAt: now },
    });
    this.logger.log({ msg: 'billing.subscription.unsubscribed', subscriptionId });
    return true;
  }
}
