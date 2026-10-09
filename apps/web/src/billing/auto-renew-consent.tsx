'use client';

import type { Money } from '@stepler/contracts';
import { Checkbox } from '@stepler/ui/components/checkbox';
import { Label } from '@stepler/ui/components/label';
import { useFormatter, useTranslations } from 'next-intl';
import { formatMoney, type PlanInterval } from './offers';

/**
 * The auto-renewal consent (plan Task 18, [B5]): one sentence with the amount and the interval,
 * required before a subscription checkout; the API refuses a checkout without it anyway
 * (`autoRenewConsent: true`). The whole row is the 44px target, like the legal consent.
 */
export function AutoRenewConsent({
  id,
  price,
  interval,
  checked,
  onCheckedChange,
  invalid = false,
  describedBy,
}: {
  id: string;
  price: Money;
  interval: PlanInterval;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  invalid?: boolean;
  describedBy?: string | undefined;
}) {
  const t = useTranslations('billing.consent');
  const format = useFormatter();
  return (
    <div className="flex min-h-11 items-start gap-3 py-1">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="mt-px"
      />
      <Label htmlFor={id} className="block min-w-0 flex-1 font-normal text-pretty">
        {t(interval, { amount: formatMoney(format.number, price) })}
      </Label>
    </div>
  );
}
