import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type AccountPaymentListQuery,
  accountPaymentListQuerySchema,
  type CheckoutRequest,
  checkoutRequestSchema,
  type CheckoutResponse,
  checkoutResponseSchema,
  type OfferList,
  type OfferListQuery,
  offerListQuerySchema,
  offerListSchema,
  type PaymentDto,
  paymentDtoSchema,
  paymentIdParamsSchema,
  type PaymentList,
  paymentListSchema,
} from '@stepler/contracts';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import type { AccountPrincipal } from '../auth/principal.js';
import { Public } from '../auth/public.decorator.js';
import { RateLimit, RateLimitGuard } from '../auth/rate-limit.js';
import { RequestId } from '../logging/request-id.decorator.js';
import { AppError } from '../errors/app-error.js';
import { SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { CheckoutService } from './checkout.service.js';
import { PaymentQueries, toPaymentDto } from './payment-queries.js';
import { ReconciliationService } from './reconciliation.service.js';
import { SubscriptionsService } from './subscriptions.service.js';

/**
 * The account's billing (ADR 0018): the public catalogue, checkouts and the account's own
 * payments. Every payment read is scoped to the signed-in user; another account's id is `404`.
 */
@ApiTags('Billing')
@ApiCookieAuth(SESSION_COOKIE_SCHEME)
@UseGuards(RateLimitGuard)
@Controller({ path: 'billing', version: '1' })
export class BillingController {
  constructor(
    private readonly checkouts: CheckoutService,
    private readonly queries: PaymentQueries,
    private readonly reconciliation: ReconciliationService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /** Public: `/pricing` renders it signed out. Counted per IP like the guests' reads. */
  @Get('offers')
  @Public()
  @RateLimit('guest-read')
  @ApiResponse({ status: 200, standardSchema: offerListSchema })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED: per-IP limit; see Retry-After' })
  offers(@Query({ schema: offerListQuerySchema }) query: OfferListQuery): Promise<OfferList> {
    return this.queries.offers(query.locale);
  }

  /**
   * Prices the target on the server and returns LiqPay's signed checkout form; the browser
   * posts it to LiqPay. The same request while a checkout is pending returns the same payment.
   */
  @Post('checkouts')
  @RateLimit('billing-checkout')
  @ApiResponse({ status: 201, standardSchema: checkoutResponseSchema })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_FAILED: unknown fields (amounts are never accepted), or a title rule',
  })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND: the collection is not yours, unknown, or being deleted',
  })
  @ApiResponse({
    status: 409,
    description:
      'OFFER_UNAVAILABLE: inactive price/offer, wrong target (a pack for a pack collection, an ' +
      'extension for an account collection, a smaller tier, a subscription price that is not ' +
      'monthly or yearly); SUBSCRIPTION_EXISTS: the account already has a paid plan; ' +
      'PAYMENT_PENDING: another offer is waiting for payment for this collection or account',
  })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED: checkouts per account per hour' })
  @ApiResponse({
    status: 503,
    description: 'PAYMENT_PROVIDER_UNAVAILABLE: payments are switched off on this server',
  })
  create(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Body({ schema: checkoutRequestSchema }) body: CheckoutRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<CheckoutResponse> {
    switch (body.kind) {
      case 'SUBSCRIPTION':
        return this.subscriptions.checkout(principal, body, requestId);
      case 'SUBSCRIPTION_CHANGE':
        // Plan changes arrive with plan Task 17.
        throw new AppError('OFFER_UNAVAILABLE', 409);
      default:
        return this.checkouts.create(principal, body, requestId);
    }
  }

  /**
   * Pays the same pending order again (after a declined card, LiqPay keeps the order open): a
   * freshly signed form for it. Not pending or past its time → `409`; start a new checkout.
   */
  @Post('payments/:id/checkout')
  @RateLimit('billing-checkout')
  @ApiResponse({ status: 201, standardSchema: checkoutResponseSchema })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: not your payment, or unknown' })
  @ApiResponse({
    status: 409,
    description: 'OFFER_UNAVAILABLE: the payment is no longer pending or its time ran out',
  })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED: checkouts per account per hour' })
  @ApiResponse({
    status: 503,
    description: 'PAYMENT_PROVIDER_UNAVAILABLE: payments are switched off on this server',
  })
  resume(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: paymentIdParamsSchema }) params: { id: string },
  ): Promise<CheckoutResponse> {
    return this.checkouts.resume(principal, params.id);
  }

  @Get('payments')
  @ApiResponse({ status: 200, standardSchema: paymentListSchema })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED: an invalid cursor or limit' })
  async payments(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Query({ schema: accountPaymentListQuerySchema }) query: AccountPaymentListQuery,
  ): Promise<PaymentList> {
    const locale = await this.queries.localeOf(principal.userId);
    return this.queries.list(principal.userId, query, locale);
  }

  /**
   * The return page polls this. While the payment is pending it asks LiqPay's `status` API (at
   * most once per 15 s per payment, from 30 s after checkout) and applies the answer like a
   * callback [P7]; a provider error leaves the payment as it is. `result_url` parameters are
   * never trusted.
   */
  @Get('payments/:id')
  @ApiResponse({ status: 200, standardSchema: paymentDtoSchema })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: not your payment, or unknown' })
  async payment(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: paymentIdParamsSchema }) params: { id: string },
  ): Promise<PaymentDto> {
    const own = await this.queries.ownPayment(principal.userId, params.id);
    const row = await this.reconciliation.refreshPayment(own.id);
    return toPaymentDto(row, await this.queries.localeOf(principal.userId));
  }
}
