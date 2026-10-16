'use client';

import { PASSWORD_RULES, type PasswordRule, passwordChecks } from '@stepler/contracts';
import { PasswordStrength } from '@stepler/ui/components/password-strength';
import { useTranslations } from 'next-intl';

type Level = 'empty' | 'weak' | 'fair' | 'good' | 'strong';

/** The meter's word for how many of the five rules hold. */
export function strengthLevel(password: string, met: number): Level {
  if (password === '') return 'empty';
  if (met >= PASSWORD_RULES.length) return 'strong';
  if (met === PASSWORD_RULES.length - 1) return 'good';
  return met >= 2 ? 'fair' : 'weak';
}

/**
 * The live password meter (ADR 0019) under a new-password field: the shared rules from
 * `@stepler/contracts` (the API checks the same), the words from the catalog.
 */
export function PasswordMeter({ password, id }: { password: string; id: string }) {
  const t = useTranslations('password');
  const checks = passwordChecks(password);
  const rules = PASSWORD_RULES.map((rule) => ({
    id: rule,
    label: t(`rules.${rule}`),
    met: checks[rule],
  }));
  const missing = PASSWORD_RULES.filter((rule: PasswordRule) => !checks[rule]);
  const met = PASSWORD_RULES.length - missing.length;
  return (
    <PasswordStrength
      id={id}
      rules={rules}
      label={t('label')}
      levelText={t(`levels.${strengthLevel(password, met)}`)}
      summary={
        missing.length === 0
          ? t('ok')
          : t('needs', { list: missing.map((rule) => t(`missing.${rule}`)).join(', ') })
      }
      metText={t('met')}
      missingText={t('missingState')}
      pristine={password === ''}
    />
  );
}
