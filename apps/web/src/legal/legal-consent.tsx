'use client';

import type { LegalDocumentKey } from '@stepler/contracts';
import { Checkbox } from '@stepler/ui/components/checkbox';
import { Label } from '@stepler/ui/components/label';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { useTranslations } from 'next-intl';
import type { ReactNode, Ref } from 'react';
import { legalPath } from './slugs';

type LegalConsentProps = {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** The catalog key of the sentence; `<terms>` and `<privacy>` tags mark the links. */
  messageKey: 'login.legalCheckbox' | 'acceptTerms.checkbox';
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  checkboxRef?: Ref<HTMLButtonElement>;
};

/**
 * The acceptance checkbox (ADR 0016) on the sign-in card and the fallback page: the box, then the
 * sentence with both documents as new-tab links, so reading them never loses a typed e-mail or
 * the Turnstile token. The checkbox is labelled by the sentence (`htmlFor`); the whole row is at
 * least 44px tall and the text is part of the target, the links excepted. The sentence is
 * placeholder copy the lawyer replaces in `messages/*.json` (`login.legalCheckbox`,
 * `acceptTerms.checkbox`).
 */
export function LegalConsent({
  id,
  checked,
  onCheckedChange,
  messageKey,
  disabled,
  invalid,
  describedBy,
  checkboxRef,
}: LegalConsentProps) {
  const t = useTranslations();
  return (
    <div className="flex min-h-11 items-start gap-3 py-1">
      <Checkbox
        ref={checkboxRef}
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="mt-px"
      />
      <Label htmlFor={id} className="block min-w-0 flex-1 font-normal text-pretty">
        {t.rich(messageKey, {
          terms: (chunks) => <DocumentLink document="TERMS">{chunks}</DocumentLink>,
          privacy: (chunks) => <DocumentLink document="PRIVACY">{chunks}</DocumentLink>,
        })}
      </Label>
    </div>
  );
}

function DocumentLink({ document, children }: { document: LegalDocumentKey; children: ReactNode }) {
  return (
    <a
      href={legalPath(document)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'rounded-frame text-link underline decoration-1 underline-offset-[0.2em] hover:text-link-hover',
        focusRing,
      )}
    >
      {children}
    </a>
  );
}
