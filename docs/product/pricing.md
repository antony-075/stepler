# Pricing

Status: **agreed by the owner on 2026-10-15** (billing M4 remarks round). The prices live in the database and are entered in `/ops` → **Тарифи і ціни** (ADR 0018, [B10]); this page is the source for those numbers and the formula behind them. Recalculate when a provider price, the tax or a limit changes.

## Price list (UAH, card payments through LiqPay)

### Subscriptions (account-level, for event businesses)

| Plan | Limits | Monthly | Yearly | Yearly per month | Yearly discount |
|---|---|---|---|---|---|
| Pro (`sub-pro`) | 5 active collections, 200 GB | 1 000 ₴ | 10 000 ₴ | 833 ₴ | 17% (2 months free) |
| Business (`sub-business`) | 20 active collections, 1 TB | 3 000 ₴ | 30 000 ₴ | 2 500 ₴ | 17% (2 months free) |

The UI computes the discount from the two live prices of a plan (`yearlySaving` in `apps/web/src/billing/offers.ts`): `1 − yearly / (12 × monthly)`, rounded to a whole percent. «Щороку» carries the best plan's «−17%», and a yearly card shows the saving and the monthly equivalent. Change a price in `/ops` and the badge follows.

### Packs (one-time, one collection)

| Offer | What it includes | Price |
|---|---|---|
| Старт (`pack-start`) | 10 GB, collecting 30 days, kept 1 year | 500 ₴ |
| Подія (`pack-event`) | 50 GB, collecting 30 days, kept 1 year | 1 500 ₴ |
| Продовжити збір на 30 днів (`ext-window-30`) | +30 days of guest uploads | 150 ₴ |
| Продовжити зберігання на рік (`ext-retention-365`) | +1 year of keeping | 500 ₴ |
| Збільшити обсяг (`ext-storage`) | Старт → Подія | the price difference, 1 000 ₴ (computed, no own price) |

A pack already includes a year of keeping, so it has no yearly variant; the next year is the retention extension.

## How the prices were derived

All amounts in UAH; 1 USD ≈ 42 UAH (2026-10-15). Recalculate with the current rate.

### Inputs

| Input | Value | Source |
|---|---|---|
| Object storage (Cloudflare R2 Standard) | $0.015 per GB-month ≈ 0.63 ₴; egress free; operations negligible (filling 200 GB ≈ $1 once) | developers.cloudflare.com/r2/pricing (2026-10-15) |
| Payment fee (LiqPay) | 1.3% Ukrainian cards, 2% foreign | liqpay.ua/tariffs (2026-10-15) |
| Tax | 6% of revenue (owner's ФОП) | owner, 2026-10-15; ЄСВ is already paid by the ФОП and is not a Stepler cost |
| Read-only keeping after an unpaid end | 90 days (owner, 2026-10-15) | |
| Fixed infrastructure (production + staging on Render, mail, domain) | ≈ 3 000 ₴/month lean, ≈ 7 500 ₴/month with headroom | Render prices from public reviews; confirm in the dashboard |

The storage quota counts originals and derivatives (`UsageService`), so a full quota is close to the bytes billed by R2.

### Formula

```
deductions        = tax + payment fee                      = 6% + 1.3% = 7.3%
storage(GB, m)    = GB × 0.63 ₴ × months
subscription cost = storage(limit, 1) + storage(limit, 3) / expected lifetime in months (12) + operations
pack cost         = storage(limit, 12 kept + 3 read-only) + operations
break-even price  = cost / (1 − deductions)
price             ≈ 3–4 × break-even, checked against the market, rounded up to a round number
yearly price      = 10 × monthly price (two months free, ≈ 17%)
contribution      = price × (1 − deductions) − cost         (what covers fixed costs, marketing, features, profit)
```

Costs assume a **fully used** limit; real use is usually 20–40%, so the real margin is higher.

### Result

| Offer | Cost at the full limit | Break-even | Price | Margin at the full limit | Contribution |
|---|---|---|---|---|---|
| Pro, month | ≈ 168 ₴ | ≈ 181 ₴ | 1 000 ₴ | ≈ 82% | ≈ 760 ₴ |
| Business, month | ≈ 836 ₴ | ≈ 902 ₴ | 3 000 ₴ | ≈ 70% | ≈ 1 945 ₴ |
| Старт | ≈ 100 ₴ | ≈ 108 ₴ | 500 ₴ | ≈ 78% | ≈ 365 ₴ |
| Подія | ≈ 483 ₴ | ≈ 521 ₴ | 1 500 ₴ | ≈ 66% | ≈ 908 ₴ |
| +1 year keeping (worst case: a full Подія) | ≈ 378 ₴ | ≈ 408 ₴ | 500 ₴ | ≈ 18% | ≈ 85 ₴ |

Sales a month that cover the fixed costs (lean / with headroom): Pro 4 / 10, Business 2 / 4, Старт 9 / 21, Подія 4 / 9.

### Market check (2026-10-15)

Kululu $39 / $99 per event, business $99–249/month; GuestPix $49–119 one-time; Wedibox $29–79; POV $5–90 per event by guest count. No Ukrainian competitor with public UAH prices was found. Stepler sits roughly 40–60% below the western prices.

## Margin policy

- The contribution pays for fixed costs first, then marketing (≈ 30% of revenue at the start) and a development fund (≈ 20%), then profit.
- Acquiring a customer must cost less than that offer's contribution (for Старт, under ≈ 365 ₴); do not price Старт lower.
- Usage-priced features (AI selection, face search, branding, watermarks) are **not** in the base prices: they go to a higher tier or a paid add-on through the offer's `features` map, so a new feature does not raise everyone's price.
- Yearly discount stays at two months free; 25% or more would take Business to ≈ 60% at the full limit.
