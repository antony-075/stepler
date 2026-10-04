export type MailLocale = 'uk' | 'en';

type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

interface MagicLinkCopy {
  subject: string;
  heading: string;
  intro: string;
  button: string;
  /** `{minutes}` is replaced with the number and the unit in the correct plural form. */
  expiry: string;
  minutes: PluralForms;
  ignore: string;
  fallback: string;
  /**
   * The acceptance line (ADR 0016): the mailbox owner confirms by signing in. Placeholder copy
   * the lawyer replaces, like `login.legalCheckbox` in the web catalogs. The sentence is
   * `${before}<terms>${and}<privacy>${after}`.
   */
  legal: { before: string; terms: string; and: string; privacy: string; after: string };
}

/** Email copy (uk default, en). Final wording may change in Phase 3. */
export const MAGIC_LINK_COPY: Readonly<Record<MailLocale, MagicLinkCopy>> = {
  uk: {
    subject: 'Вхід до Stepler',
    heading: 'Вхід до Stepler',
    intro: 'Щоб увійти, натисніть кнопку нижче.',
    button: 'Увійти',
    expiry: 'Посилання діє {minutes} і працює один раз.',
    minutes: { one: 'хвилину', few: 'хвилини', many: 'хвилин', other: 'хвилини' },
    ignore: 'Якщо ви не надсилали цей запит, просто проігноруйте цей лист.',
    fallback: 'Якщо кнопка не працює, відкрийте це посилання:',
    legal: {
      before: 'Продовжуючи, ви приймаєте ',
      terms: 'Умови використання',
      and: ' та ',
      privacy: 'Політику конфіденційності',
      after: '.',
    },
  },
  en: {
    subject: 'Sign in to Stepler',
    heading: 'Sign in to Stepler',
    intro: 'Use the button below to sign in.',
    button: 'Sign in',
    expiry: 'The link is valid for {minutes} and works once.',
    minutes: { one: 'minute', other: 'minutes' },
    ignore: "If you didn't request this, ignore this email.",
    fallback: "If the button doesn't work, open this link:",
    legal: {
      before: 'By continuing, you accept the ',
      terms: 'Terms of Service',
      and: ' and the ',
      privacy: 'Privacy Policy',
      after: '.',
    },
  },
};

export function formatMinutes(locale: MailLocale, minutes: number): string {
  const forms = MAGIC_LINK_COPY[locale].minutes;
  const rule = new Intl.PluralRules(locale).select(minutes);
  return `${minutes} ${forms[rule] ?? forms.other}`;
}
