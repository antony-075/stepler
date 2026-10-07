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

/** Report reasons as the reporter picked them (R1); mirrors the web's `ops.reasons`. */
export const REPORT_REASON_LABELS: Readonly<
  Record<MailLocale, Record<'ILLEGAL' | 'INAPPROPRIATE' | 'PRIVACY' | 'SPAM' | 'OTHER', string>>
> = {
  uk: {
    ILLEGAL: 'Незаконний вміст',
    INAPPROPRIATE: 'Непристойний або образливий',
    PRIVACY: 'Порушує приватність',
    SPAM: 'Спам або реклама',
    OTHER: 'Інше',
  },
  en: {
    ILLEGAL: 'Illegal content',
    INAPPROPRIATE: 'Indecent or offensive',
    PRIVACY: 'Violates privacy',
    SPAM: 'Spam or advertising',
    OTHER: 'Other',
  },
};

/** The operator's «нова скарга» mail: Ukrainian only [P7]; `{label}`, `{url}` are filled in. */
export const REPORT_RECEIVED_COPY = {
  subject: 'Stepler: нова скарга ({label})',
  heading: 'Нова скарга',
  intro: 'Надійшла нова скарга на вміст.',
  reason: 'Причина: {label}',
  open: 'Переглянути: {url}',
} as const;

/**
 * The operator's «нова апеляція» mail (slice 9b, Q-A5): the target type and the console link
 * only; the admin's text is read signed in.
 */
export const APPEAL_RECEIVED_COPY = {
  subject: 'Stepler: нова апеляція ({label})',
  heading: 'Нова апеляція',
  intro: 'Адміністратор колекції подав апеляцію.',
  target: 'Щодо: {label}',
  open: 'Переглянути: {url}',
  targets: { CONTENT: 'кадр', COLLECTION: 'колекція' },
} as const;

interface ReportDecisionCopy {
  subject: string;
  heading: string;
  ACTIONED: string;
  DISMISSED: string;
  /** `{email}` is the appeal contact (`LEGAL_CONTACT_EMAIL`); the line is left out without it. */
  contact: string;
}

/** The reporter's decision mail, in their interface language [P7]. No content, no note. */
export const REPORT_DECISION_COPY: Readonly<Record<MailLocale, ReportDecisionCopy>> = {
  uk: {
    subject: 'Stepler: вашу скаргу розглянуто',
    heading: 'Вашу скаргу розглянуто',
    ACTIONED: 'Ми розглянули вашу скаргу і вжили заходів.',
    DISMISSED: 'Ми розглянули вашу скаргу: порушення не підтвердилося.',
    contact: 'Якщо ви не згодні з рішенням, напишіть на {email}.',
  },
  en: {
    subject: 'Stepler: your report has been reviewed',
    heading: 'Your report has been reviewed',
    ACTIONED: 'We reviewed your report and took action.',
    DISMISSED: 'We reviewed your report: no violation was confirmed.',
    contact: 'If you disagree with the decision, write to {email}.',
  },
};

interface AccountBlockedCopy {
  subject: string;
  heading: string;
  text: string;
  /** `{email}` is `LEGAL_CONTACT_EMAIL`; the line is left out without it. */
  contact: string;
}

/** Instead of a sign-in link, to a blocked account's own mailbox ([Q3], slice 9). */
export const ACCOUNT_BLOCKED_COPY: Readonly<Record<MailLocale, AccountBlockedCopy>> = {
  uk: {
    subject: 'Stepler: акаунт заблоковано',
    heading: 'Акаунт заблоковано',
    text: 'Ваш акаунт Stepler заблоковано, тому посилання для входу не надіслано.',
    contact: 'Якщо ви не згодні, напишіть на {email}.',
  },
  en: {
    subject: 'Stepler: account blocked',
    heading: 'Account blocked',
    text: 'Your Stepler account is blocked, so no sign-in link was sent.',
    contact: 'If you disagree, write to {email}.',
  },
};
