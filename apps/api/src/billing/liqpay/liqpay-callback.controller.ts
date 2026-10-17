import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public, SkipOriginCheck } from '../../auth/public.decorator.js';
import { RateLimit, RateLimitGuard } from '../../auth/rate-limit.js';
import { PaymentEvents } from '../payment-events.service.js';

/** The callback LiqPay posts (`application/x-www-form-urlencoded`), at most 64 KB of data. */
const liqpayCallbackSchema = z.object({
  data: z.string().min(1).max(65_536),
  signature: z.string().min(1).max(200),
});
type LiqPayCallback = z.infer<typeof liqpayCallbackSchema>;

/**
 * `POST /api/v1/billing/liqpay/callback` (ADR 0018, plan Task 12). Server-to-server: public, no
 * Origin check (LiqPay posts cross-origin), no cookies read; authenticated by the signature
 * alone. Answers `200` once the event is stored, also for an order that is not ours, so LiqPay
 * does not retry a poison message; `400` only for a bad signature or a malformed body.
 */
@ApiTags('Billing')
@Public()
@SkipOriginCheck()
@UseGuards(RateLimitGuard)
@Controller({ path: 'billing/liqpay', version: '1' })
export class LiqPayCallbackController {
  constructor(private readonly events: PaymentEvents) {}

  @Post('callback')
  @HttpCode(HttpStatus.OK)
  @RateLimit('billing-callback')
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['data', 'signature'],
      properties: {
        data: { type: 'string', description: 'base64 JSON, as LiqPay sends it' },
        signature: {
          type: 'string',
          description: 'base64(sha3-256(private_key + data + private_key))',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Stored (and applied, or left for reconciliation)' })
  @ApiResponse({
    status: 400,
    description: 'BILLING_SIGNATURE_INVALID: not signed with our key; VALIDATION_FAILED: no data',
  })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED: per-IP limit' })
  @ApiResponse({
    status: 503,
    description: 'PAYMENT_PROVIDER_UNAVAILABLE: payments are switched off on this server',
  })
  async callback(@Body({ schema: liqpayCallbackSchema }) body: LiqPayCallback): Promise<object> {
    await this.events.receive(body);
    return {};
  }
}
