/**
 * The tabs of «Тариф і оплата» (billing page v3, owner 2026-10-09): «Огляд» (what the account has),
 * «Тарифи» (the subscriptions and packs on sale) and «Історія оплат». The tab lives in `?tab=`,
 * like the collection page's; «Огляд» is the default and has no parameter.
 */
export const BILLING_TABS = ['overview', 'plans', 'history'] as const;
export type BillingTab = (typeof BILLING_TABS)[number];

/** The page's path; `?tab=` and the purchase parameters go on it. */
export const BILLING_PATH = '/app/billing';

/** The id of the packs group on «Тарифи», for «Купити пакет». */
export const PACKS_SECTION_ID = 'packs';

/** The id of the subscriptions group on «Тарифи», for «Обрати тариф» beside «Купити пакет». */
export const SUBSCRIPTIONS_SECTION_ID = 'subscriptions';

/**
 * The tab a URL opens. Without `?tab=`, the purchase parameters (`?pack=`, `?plan=`,
 * `?collection=`, from /pricing, a collection page or a failed payment) open «Тарифи», where
 * their dialogs live; anything else opens «Огляд».
 */
export function billingTab(params: { get(name: string): string | null }): BillingTab {
  const tab = params.get('tab');
  if (tab === 'plans' || tab === 'history') return tab;
  if (tab !== null) return 'overview';
  const buying = ['pack', 'plan', 'collection'].some((name) => params.get(name) !== null);
  return buying ? 'plans' : 'overview';
}

/** A link to a tab: «Огляд» is the bare path; `hash` scrolls to a group on it. */
export function billingHref(tab: BillingTab, hash?: string): string {
  const query = tab === 'overview' ? '' : `?tab=${tab}`;
  return `${BILLING_PATH}${query}${hash === undefined ? '' : `#${hash}`}`;
}

/** The two kinds of offer on «Тарифи», shown one at a time (owner remark, billing M4 round). */
export type OfferKind = 'packs' | 'subscriptions';

/**
 * Which kind «Тарифи» shows until the owner picks one: packs when a link asked for one
 * (`?pack=`, `?collection=`, `#packs`), else subscriptions (owner 2026-10-16: the subscription
 * comes first and is chosen by default).
 */
export function defaultOfferKind(
  params: { get(name: string): string | null },
  hash: string,
): OfferKind {
  if (params.get('pack') !== null || params.get('collection') !== null) return 'packs';
  if (hash === `#${PACKS_SECTION_ID}`) return 'packs';
  return 'subscriptions';
}
