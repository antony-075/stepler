'use client';

import { Label } from '@stepler/ui/components/label';
import { PasswordInput } from '@stepler/ui/components/password-input';
import { PasswordMatch } from '@stepler/ui/components/password-strength';
import { useTranslations } from 'next-intl';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { FieldError } from './field-error';
import { PasswordMeter } from './password-meter';

/**
 * A new password typed twice (owner 2026-10-16): the field with show/hide and the meter under it,
 * then «Підтвердіть пароль» with the match line. The form's schema refuses a password that misses
 * a rule and a confirmation that differs; the errors appear under their field after a submit.
 */
export function NewPasswordFields({
  idPrefix,
  passwordLabel,
  confirmLabel,
  password,
  confirm,
  passwordField,
  confirmField,
  passwordError,
  confirmError,
  disabled,
}: {
  idPrefix: string;
  passwordLabel: string;
  confirmLabel: string;
  password: string;
  confirm: string;
  passwordField: UseFormRegisterReturn;
  confirmField: UseFormRegisterReturn;
  passwordError: string | null;
  confirmError: string | null;
  disabled: boolean;
}) {
  const t = useTranslations();
  const ids = {
    password: `${idPrefix}-password`,
    meter: `${idPrefix}-meter`,
    passwordError: `${idPrefix}-password-error`,
    confirm: `${idPrefix}-confirm`,
    match: `${idPrefix}-match`,
    confirmError: `${idPrefix}-confirm-error`,
  };
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={ids.password}>{passwordLabel}</Label>
        <PasswordInput
          id={ids.password}
          autoComplete="new-password"
          showLabel={t('login.showPassword')}
          hideLabel={t('login.hidePassword')}
          aria-invalid={passwordError !== null}
          aria-describedby={
            passwordError === null ? ids.meter : `${ids.passwordError} ${ids.meter}`
          }
          disabled={disabled}
          {...passwordField}
        />
        {passwordError === null ? null : (
          <FieldError id={ids.passwordError} message={passwordError} />
        )}
        <PasswordMeter id={ids.meter} password={password} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={ids.confirm}>{confirmLabel}</Label>
        <PasswordInput
          id={ids.confirm}
          autoComplete="new-password"
          showLabel={t('login.showPassword')}
          hideLabel={t('login.hidePassword')}
          aria-invalid={confirmError !== null}
          aria-describedby={
            confirmError === null || confirm !== '' ? ids.match : `${ids.confirmError} ${ids.match}`
          }
          disabled={disabled}
          {...confirmField}
        />
        {/* A mismatch is said by the live line below; a second copy on blur would shift the form. */}
        {confirmError === null || confirm !== '' ? null : (
          <FieldError id={ids.confirmError} message={confirmError} />
        )}
        <PasswordMatch
          id={ids.match}
          matches={confirm === '' ? null : confirm === password}
          matchText={t('password.match')}
          mismatchText={t('password.mismatch')}
        />
      </div>
    </>
  );
}
