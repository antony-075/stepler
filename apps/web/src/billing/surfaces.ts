// One look for every part of «Тариф і оплата» (owner 2026-10-16: «Ваш тариф» and «Історія» from
// direction C, «Тарифи» from A, «стилістика всіх розділів має бути уніфікована»;
// DESIGN-SYSTEM.md §0.12). The page's own scale, shared by the tabs:
// - CARD: every block (the plan, the limits, an offer, the history list) — a 20px radius, the
//   1px border and the card shadow;
// - FEATURED: the one dark surface (the inverse tokens with a fine dot texture) — the highlighted
//   plan or pack on «Тарифи»; nothing else on the page is dark;
// - SECTION_TITLE / SECTION_NOTE: a section's heading and its one line;
// - PRICE / PRICE_UNIT: the big tabular price and its unit, the same on every card;
// - CHIP: a small status or saving pill (the success one for «−17%» and «Економія»).

export const CARD = 'rounded-[1.25rem] border bg-card text-card-foreground shadow-card';

export const FEATURED =
  'rounded-[1.25rem] bg-inverse text-inverse-foreground shadow-[0_24px_48px_-28px_rgb(24_24_27/0.6)] bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1.4px)] bg-size-[16px_16px]';

export const SECTION_TITLE = 'text-[1.1875rem] leading-snug font-semibold';
export const SECTION_NOTE = 'max-w-[70ch] text-sm text-pretty text-muted-foreground';

export const PRICE = 'text-[2.5rem] leading-none font-bold tracking-tight tabular-nums';
export const PRICE_UNIT = 'text-[0.9375rem] text-muted-foreground';

export const CHIP =
  'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[0.8125rem] font-semibold tabular-nums';
export const CHIP_SUCCESS = `${CHIP} bg-success-soft text-success`;
