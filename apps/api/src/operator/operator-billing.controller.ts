import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { ApiCookieAuth, ApiHeader, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type GrantCreate,
  grantCreateSchema,
  type OperatorActionRequest,
  operatorActionRequestSchema,
  type OperatorBillingAccount,
  operatorBillingAccountQuerySchema,
  operatorBillingAccountSchema,
  type OperatorBillingAccountQuery,
  operatorBillingIdParamsSchema,
  operatorCollectionIdParamsSchema,
  type OfferCreate,
  offerCreateSchema,
  type OfferUpsert,
  offerUpsertSchema,
  type OperatorOffer,
  type OperatorOfferList,
  operatorOfferListSchema,
  operatorOfferSchema,
  type PriceSet,
  priceSetSchema,
  type OperatorPaymentDetail,
  operatorPaymentDetailSchema,
  type OperatorPaymentList,
  operatorPaymentListSchema,
  type OperatorSubscription,
  type OperatorSubscriptionList,
  type OperatorSubscriptionListQuery,
  operatorSubscriptionListQuerySchema,
  operatorSubscriptionListSchema,
  type OperatorSubscriptionRefresh,
  operatorSubscriptionRefreshSchema,
  operatorSubscriptionSchema,
  type PaymentListQuery,
  paymentListQuerySchema,
  type RefundCreate,
  refundCreateSchema,
  type RefundDto,
  refundDtoSchema,
  type SubscriptionDto,
  subscriptionDtoSchema,
} from '@stepler/contracts';
import type { OperatorPrincipal } from '../auth/principal.js';
import { GrantsService } from '../billing/grants.service.js';
import { OffersService } from '../billing/offers.service.js';
import { OperatorBillingService } from '../billing/operator-billing.service.js';
import { RefundsService } from '../billing/refunds.service.js';
import { parseIdempotencyKey } from '../common/idempotency-key.js';
import { RequestId } from '../logging/request-id.decorator.js';
import { SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { CurrentOperator } from './current-operator.decorator.js';
import { OperatorGuard } from './operator.guard.js';
import { NOT_OPERATOR } from './operator-reports.controller.js';

const PROVIDER_DOWN = {
  status: 503,
  description: 'PAYMENT_PROVIDER_UNAVAILABLE: LiqPay did not answer; nothing changed',
} as const;

/**
 * Billing in the operator console (ADR 0018): look an account up by e-mail, grant or revoke a
 * complimentary plan [P13], every payment and subscription, refunds [B11], a plan or a pack ended
 * now. Billing is not content: no collection content is ever returned. Non-operators get `404`.
 */
@ApiTags('Operator')
@ApiCookieAuth(SESSION_COOKIE_SCHEME)
@UseGuards(OperatorGuard)
@Controller({ path: 'operator/billing', version: '1' })
export class OperatorBillingController {
  constructor(
    private readonly grants: GrantsService,
    private readonly billing: OperatorBillingService,
    private readonly refunds: RefundsService,
    private readonly offerEditor: OffersService,
  ) {}

  @Get('accounts')
  @ApiResponse({ status: 200, standardSchema: operatorBillingAccountSchema })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND: no account with this e-mail, or not an operator',
  })
  account(
    @CurrentOperator() op: OperatorPrincipal,
    @Query({ schema: operatorBillingAccountQuerySchema }) query: OperatorBillingAccountQuery,
  ): Promise<OperatorBillingAccount> {
    return this.grants.accountByEmail(op, query.email);
  }

  @Get('offers')
  @ApiResponse({ status: 200, standardSchema: operatorOfferListSchema })
  @ApiResponse(NOT_OPERATOR)
  offers(): Promise<OperatorOfferList> {
    return this.grants.offers();
  }

  // ── offers and prices (plan Task 20) ─────────────────────────────────────────────────────

  @Post('offers')
  @ApiResponse({
    status: 201,
    standardSchema: operatorOfferSchema,
    description: 'Created off sale',
  })
  @ApiResponse({
    status: 400,
    description:
      'VALIDATION_FAILED: a bad field, a code in use, or limits the kind does not allow (BillingOffer_kind_shape)',
  })
  @ApiResponse(NOT_OPERATOR)
  createOffer(
    @CurrentOperator() op: OperatorPrincipal,
    @Body({ schema: offerCreateSchema }) body: OfferCreate,
    @RequestId() requestId: string | undefined,
  ): Promise<OperatorOffer> {
    return this.offerEditor.create(op, body, requestId);
  }

  @Patch('offers/:id')
  @ApiResponse({ status: 200, standardSchema: operatorOfferSchema })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_FAILED: a bad field, or limits the kind does not allow',
  })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: no such offer, or not an operator' })
  updateOffer(
    @CurrentOperator() op: OperatorPrincipal,
    @Param({ schema: operatorBillingIdParamsSchema }) params: { id: string },
    @Body({ schema: offerUpsertSchema }) body: OfferUpsert,
    @RequestId() requestId: string | undefined,
  ): Promise<OperatorOffer> {
    return this.offerEditor.update(op, params.id, body, requestId);
  }

  @Post('offers/:id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: operatorOfferSchema })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED: a 1–500 reason is required' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: no such offer, or not an operator' })
  activateOffer(
    @CurrentOperator() op: OperatorPrincipal,
    @Param({ schema: operatorBillingIdParamsSchema }) params: { id: string },
    @Body({ schema: operatorActionRequestSchema }) body: OperatorActionRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<OperatorOffer> {
    return this.offerEditor.setActive(op, params.id, true, body.reason, requestId);
  }

  @Post('offers/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: operatorOfferSchema })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_FAILED: no reason, or the trial offer (it cannot be switched off)',
  })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: no such offer, or not an operator' })
  deactivateOffer(
    @CurrentOperator() op: OperatorPrincipal,
    @Param({ schema: operatorBillingIdParamsSchema }) params: { id: string },
    @Body({ schema: operatorActionRequestSchema }) body: OperatorActionRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<OperatorOffer> {
    return this.offerEditor.setActive(op, params.id, false, body.reason, requestId);
  }

  @Put('offers/:id/prices')
  @ApiResponse({
    status: 200,
    standardSchema: operatorOfferSchema,
    description: 'The slot’s new live price; the old row stays (inactive) for history',
  })
  @ApiResponse({
    status: 400,
    description:
      'VALIDATION_FAILED: an amount out of range, no reason, or a period the offer is not sold in',
  })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: no such offer, or not an operator' })
  setPrice(
    @CurrentOperator() op: OperatorPrincipal,
    @Param({ schema: operatorBillingIdParamsSchema }) params: { id: string },
    @Body({ schema: priceSetSchema }) body: PriceSet,
    @RequestId() requestId: string | undefined,
  ): Promise<OperatorOffer> {
    return this.offerEditor.setPrice(op, params.id, body, requestId);
  }

  @Post('grants')
  @ApiResponse({ status: 201, standardSchema: subscriptionDtoSchema })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_FAILED: not a subscription offer, an end in the past, or no reason',
  })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: no such account, or not an operator' })
  @ApiResponse({
    status: 409,
    description: 'SUBSCRIPTION_EXISTS: the account pays for a live subscription; cancel it first',
  })
  grant(
    @CurrentOperator() op: OperatorPrincipal,
    @Body({ schema: grantCreateSchema }) body: GrantCreate,
    @RequestId() requestId: string | undefined,
  ): Promise<SubscriptionDto> {
    return this.grants.grant(
      op,
      {
        userId: body.userId,
        offerId: body.offerId,
        endsAt: body.endsAt === null ? null : new Date(body.endsAt),
        reason: body.reason,
      },
      requestId,
    );
  }

  @Post('grants/:id/revoke')
  @ApiResponse({ status: 201, standardSchema: subscriptionDtoSchema })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED: a 1–500 reason is required' })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND: no live grant with this id, or not an operator',
  })
  revoke(
    @CurrentOperator() op: OperatorPrincipal,
    @Param({ schema: operatorBillingIdParamsSchema }) params: { id: string },
    @Body({ schema: operatorActionRequestSchema }) body: OperatorActionRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<SubscriptionDto> {
    return this.grants.revoke(op, params.id, body.reason, requestId);
  }

  // ── payments and refunds (plan Task 21) ──────────────────────────────────────────────────

  @Get('payments')
  @ApiResponse({ status: 200, standardSchema: operatorPaymentListSchema })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED: a bad filter or cursor' })
  @ApiResponse(NOT_OPERATOR)
  payments(
    @Query({ schema: paymentListQuerySchema }) query: PaymentListQuery,
  ): Promise<OperatorPaymentList> {
    return this.billing.payments(query);
  }

  @Get('payments/:id')
  @ApiResponse({ status: 200, standardSchema: operatorPaymentDetailSchema })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: no such payment, or not an operator' })
  payment(
    @Param({ schema: operatorBillingIdParamsSchema }) params: { id: string },
  ): Promise<OperatorPaymentDetail> {
    return this.billing.payment(params.id);
  }

  @Post('payments/:id/refunds')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'A UUID per refund form' })
  @ApiResponse({
    status: 201,
    standardSchema: refundDtoSchema,
    description: 'LiqPay answered (SUCCEEDED or FAILED), or did not (PENDING: the job settles it)',
  })
  @ApiResponse({ status: 200, description: 'A retry with the same key: the refund made first' })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_FAILED: amount, reason or Idempotency-Key missing or invalid',
  })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: no such payment, or not an operator' })
  @ApiResponse({
    status: 409,
    description:
      'REFUND_EXCEEDS_PAID: more than paid − refunded − in flight, or the payment is not paid; IDEMPOTENCY_CONFLICT: the key was used for another amount',
  })
  async refund(
    @CurrentOperator() op: OperatorPrincipal,
    @Param({ schema: operatorBillingIdParamsSchema }) params: { id: string },
    @Body({ schema: refundCreateSchema }) body: RefundCreate,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @RequestId() requestId: string | undefined,
    @Res({ passthrough: true }) res: ServerResponse,
  ): Promise<RefundDto> {
    const { refund, created } = await this.refunds.refund(
      op,
      {
        paymentId: params.id,
        amountMinor: body.amountMinor,
        reason: body.reason,
        idempotencyKey: parseIdempotencyKey(idempotencyKey),
      },
      requestId,
    );
    if (!created) res.statusCode = HttpStatus.OK;
    return refund;
  }

  // ── subscriptions and packs (plan Task 21) ───────────────────────────────────────────────

  @Get('subscriptions')
  @ApiResponse({ status: 200, standardSchema: operatorSubscriptionListSchema })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED: a bad filter or cursor' })
  @ApiResponse(NOT_OPERATOR)
  subscriptions(
    @Query({ schema: operatorSubscriptionListQuerySchema }) query: OperatorSubscriptionListQuery,
  ): Promise<OperatorSubscriptionList> {
    return this.billing.subscriptions(query);
  }

  @Post('subscriptions/:id/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: operatorSubscriptionRefreshSchema })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND: no paid (LiqPay) subscription with this id, or not an operator',
  })
  @ApiResponse(PROVIDER_DOWN)
  refresh(
    @Param({ schema: operatorBillingIdParamsSchema }) params: { id: string },
  ): Promise<OperatorSubscriptionRefresh> {
    return this.billing.refresh(params.id);
  }

  @Post('subscriptions/:id/end')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: operatorSubscriptionSchema })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED: a 1–500 reason is required' })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND: no paid (LiqPay) subscription with this id, or not an operator',
  })
  @ApiResponse(PROVIDER_DOWN)
  endSubscription(
    @CurrentOperator() op: OperatorPrincipal,
    @Param({ schema: operatorBillingIdParamsSchema }) params: { id: string },
    @Body({ schema: operatorActionRequestSchema }) body: OperatorActionRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<OperatorSubscription> {
    return this.billing.endSubscription(op, params.id, body.reason, requestId);
  }

  @Post('packs/:collectionId/end')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'The pack’s window and retention end now' })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED: a 1–500 reason is required' })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND: no pack on this collection, or not an operator',
  })
  async endPack(
    @CurrentOperator() op: OperatorPrincipal,
    @Param({ schema: operatorCollectionIdParamsSchema }) params: { collectionId: string },
    @Body({ schema: operatorActionRequestSchema }) body: OperatorActionRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<void> {
    await this.billing.endPack(op, params.collectionId, body.reason, requestId);
  }
}
