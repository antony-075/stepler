'use client';

import {
  codePointLength,
  collectionWelcomeMessageSchema,
  WELCOME_MESSAGE_MAX_CHARS,
} from '@stepler/contracts';
import { Field } from '@stepler/ui/components/field';
import { Textarea } from '@stepler/ui/components/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { SectionProps } from './section-props';

/**
 * «Привітання»: one paragraph of at most 160 code points, with the `n/160` counter in mono. A
 * valid text goes into the working copy as it is typed (autosaved like everything else); an
 * invalid one shows why and is never sent. Empty means no welcome.
 */
export function WelcomeSection({ editor, readOnly }: SectionProps) {
  const t = useTranslations('guestPage.welcome');
  const [text, setText] = useState(editor.working.welcomeMessage ?? '');
  const length = codePointLength(text.trim());
  const error =
    length > WELCOME_MESSAGE_MAX_CHARS
      ? t('tooLong', { max: WELCOME_MESSAGE_MAX_CHARS })
      : /[\r\n]/.test(text)
        ? t('lineBreaks')
        : undefined;
  return (
    <Field id="guest-page-welcome" label={t('label')} hint={t('helper')} error={error}>
      {(control) => (
        <div className="grid gap-1">
          <Textarea
            {...control}
            rows={3}
            value={text}
            readOnly={readOnly}
            onChange={(event) => {
              const next = event.target.value;
              setText(next);
              if (next.trim() === '') {
                editor.dispatch({ type: 'welcome', value: null }, 'welcome');
                return;
              }
              const parsed = collectionWelcomeMessageSchema.safeParse(next);
              // Typing is one undo step per pause (owner remark 113).
              if (parsed.success)
                editor.dispatch({ type: 'welcome', value: parsed.data }, 'welcome');
            }}
          />
          <p className="justify-self-end type-data text-sm text-muted-foreground tabular-nums">
            {t('counter', { count: length, max: WELCOME_MESSAGE_MAX_CHARS })}
          </p>
        </div>
      )}
    </Field>
  );
}
