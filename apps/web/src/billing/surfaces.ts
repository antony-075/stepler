// The shared scale of «Тариф і оплата» (owner 2026-10-16: one to one with the artboards, «Ваш
// тариф» and «Історія» from direction C, «Тарифи» from A; DESIGN-SYSTEM.md §0.12). Each block
// keeps its own artboard card (C's bordered cards without a shadow, A's lifted offer cards); what
// they share is here:
// - FEATURED: the one dark surface (the inverse tokens with a fine dot texture) — the highlighted
//   plan or pack on «Тарифи»; nothing else on the page is dark;
// - SECTION_TITLE / SECTION_NOTE: a section's heading and its one line; GROUP_TITLE / GROUP_NOTE
//   the bigger heading of an offers group on «Тарифи».

export const FEATURED =
  'rounded-[1.25rem] bg-inverse text-inverse-foreground shadow-[0_24px_48px_-28px_rgb(24_24_27/0.6)] bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1.4px)] bg-size-[16px_16px]';

export const SECTION_TITLE = 'text-[1.1875rem] leading-snug font-semibold';
export const SECTION_NOTE = 'max-w-[70ch] text-sm text-pretty text-muted-foreground';

/** An offers group's heading on «Тарифи» (24px; 21px on phones) and its line (15px). */
export const GROUP_TITLE = 'text-[1.3125rem] leading-snug font-semibold sm:text-2xl';
export const GROUP_NOTE = 'max-w-[70ch] text-[0.9375rem] text-pretty text-muted-foreground';
