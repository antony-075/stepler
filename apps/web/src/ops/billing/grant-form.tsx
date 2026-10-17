'use client';

import type { OperatorOffer } from '@stepler/contracts';
import { Button } from '@stepler/ui/components/button';
import { Field } from '@stepler/ui/components/field';
import { Input } from '@stepler/ui/components/input';
import { RadioGroup, RadioGroupItem } from '@stepler/ui/components/radio-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@stepler/ui/components/select';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { endOfKyivDay, formatPlanBytes } from './plan-format';

export interface GrantChoice {
  offerId: string;
  /** ISO instant; `null` = until revoked. */
  endsAt: string | null;
}

type Term = 'open' | 'until';
const OPEN: Term = 'open';
const UNTIL: Term = 'until';

/**
 * Picks what to grant: a subscription offer (drafts included: a grant may use an offer that is
 * not on sale yet) and a term, «Без терміну» or «До дати» (the chosen day, inclusive, in Kyiv).
 * The reason is asked for by the confirm dialog the caller opens with `onSubmit`.
 */
export function GrantForm({
  offers,
  replacing,
  onSubmit,
}: {
  offers: OperatorOffer[];
  /** A live grant exists: the button says «Замінити». */
  replacing: boolean;
  onSubmit: (choice: GrantChoice) => void;
}) {
  const t = useTranslations('ops.billing');
  const format = useFormatter();
  const locale = useLocale();
  const ids = { offer: useId(), term: useId() };
  const [offerId, setOfferId] = useState(offers[0]?.id ?? '');
  const [term, setTerm] = useState<Term>(OPEN);
  const [day, setDay] = useState('');
  const [error, setError] = useState<string | null>(null);

  const label = (offer: OperatorOffer) => {
    const title = locale === 'en' ? offer.titleEn : offer.titleUk;
    const storage =
      offer.limits.storageBytes === null
        ? ''
        : formatPlanBytes(format.number, offer.limits.storageBytes);
    const base = t('offerOption', {
      title,
      collections: offer.limits.activeCollections ?? 0,
      storage,
    });
    return offer.active ? base : t('offerDraft', { offer: base });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (term === UNTIL) {
      const endsAt = endOfKyivDay(day);
      if (endsAt === null || endsAt.getTime() <= Date.now()) {
        setError(t('endDateError'));
        return;
      }
      setError(null);
      onSubmit({ offerId, endsAt: endsAt.toISOString() });
      return;
    }
    setError(null);
    onSubmit({ offerId, endsAt: null });
  };

  return (
    <form noValidate onSubmit={submit} className="grid gap-5">
      <div className="grid gap-2">
        <span id={ids.offer} className="text-sm font-medium">
          {t('offer')}
        </span>
        <Select value={offerId} onValueChange={setOfferId}>
          <SelectTrigger aria-labelledby={ids.offer} className="w-full md:max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {offers.map((offer) => (
                <SelectItem key={offer.id} value={offer.id}>
                  {label(offer)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <fieldset className="grid gap-3">
        <legend id={ids.term} className="mb-2 text-sm font-medium">
          {t('term')}
        </legend>
        <RadioGroup
          value={term}
          onValueChange={(value) => setTerm(value as Term)}
          aria-labelledby={ids.term}
          className="grid gap-3 sm:flex sm:gap-6"
        >
          <label className="flex min-h-11 items-center gap-3 text-[0.9375rem] md:min-h-0">
            <RadioGroupItem value={OPEN} />
            {t('termOpen')}
          </label>
          <label className="flex min-h-11 items-center gap-3 text-[0.9375rem] md:min-h-0">
            <RadioGroupItem value={UNTIL} />
            {t('termUntil')}
          </label>
        </RadioGroup>
        {term === UNTIL ? (
          <Field id="ops-grant-end" label={t('endDate')} error={error ?? undefined}>
            {(control) => (
              <Input
                {...control}
                type="date"
                value={day}
                onChange={(event) => setDay(event.target.value)}
                className="w-full sm:w-56"
              />
            )}
          </Field>
        ) : null}
      </fieldset>
      <div>
        <Button type="submit" disabled={offerId === ''}>
          {replacing ? t('replace') : t('grant')}
        </Button>
      </div>
    </form>
  );
}
