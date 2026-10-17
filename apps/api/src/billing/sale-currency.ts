import type { Currency } from '../generated/prisma/client.js';

/**
 * The one currency we charge and issue receipts in (owner 2026-10-16: «оплата будет производиться
 * в гривне и чек будет гривневый»). An offer's USD and EUR prices are reference amounts the
 * pages show for orientation; checkouts, subscriptions and plan changes only take a UAH price
 * (ADR 0018, B2 addendum).
 */
export const SALE_CURRENCY: Currency = 'UAH';
