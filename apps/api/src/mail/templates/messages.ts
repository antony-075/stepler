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

interface BillingReadOnlyCopy {
  subject: string;
  heading: string;
  /** Why: the trial or the plan ended. */
  reasons: { trial: string; plan: string };
  effect: string;
  /** `{date}`: when the content is due for deletion. */
  keep: string;
  /** `{url}`: «Тариф і оплата». */
  choose: string;
}

/** Billing (ADR 0018 [B8]): the account became read-only. Sent once per read-only episode. */
export const BILLING_READ_ONLY_COPY: Readonly<Record<MailLocale, BillingReadOnlyCopy>> = {
  uk: {
    subject: 'Stepler: колекції доступні лише для перегляду',
    heading: 'Колекції доступні лише для перегляду',
    reasons: { trial: 'Пробний період завершився.', plan: 'Ваш тариф завершився.' },
    effect:
      'Гості більше не можуть нічого додавати. Ви й надалі можете переглядати й завантажувати вміст.',
    keep: 'Вміст зберігатиметься до {date}, потім його буде видалено. Ми попередимо за 30 і за 7 днів.',
    choose: 'Щоб знову збирати фото й відео, оберіть тариф: {url}',
  },
  en: {
    subject: 'Stepler: your collections are view-only',
    heading: 'Your collections are view-only',
    reasons: { trial: 'Your trial has ended.', plan: 'Your plan has ended.' },
    effect: 'Guests can no longer add anything. You can still view and download everything.',
    keep: 'The content is kept until {date}, then deleted. We will remind you 30 and 7 days before.',
    choose: 'To collect photos and videos again, choose a plan: {url}',
  },
};

interface BillingDeletionWarningCopy {
  /** `{title}`, `{date}`. */
  subject: string;
  heading: string;
  /** `{title}`, `{date}`. */
  text: string;
  /** `{url}`. */
  keep: string;
  download: string;
}

/** Billing (ADR 0018 [B8]): a read-only collection is due for deletion in 30 or 7 days. */
export const BILLING_DELETION_WARNING_COPY: Readonly<
  Record<MailLocale, BillingDeletionWarningCopy>
> = {
  uk: {
    subject: 'Stepler: колекцію «{title}» буде видалено {date}',
    heading: 'Колекцію буде видалено',
    text: 'Колекція «{title}» доступна лише для перегляду. {date} її буде видалено разом з усім вмістом.',
    keep: 'Щоб зберегти її, оберіть тариф: {url}',
    download: 'Або завантажте вміст, який хочете залишити, до цієї дати.',
  },
  en: {
    subject: 'Stepler: “{title}” will be deleted on {date}',
    heading: 'Your collection will be deleted',
    text: '“{title}” is view-only. On {date} it will be deleted with everything in it.',
    keep: 'To keep it, choose a plan: {url}',
    download: 'Or download what you want to keep before that date.',
  },
};

interface BillingRenewalFailedCopy {
  subject: string;
  heading: string;
  /** `{plan}`. */
  text: string;
  /** `{date}`: when the grace period ends. */
  grace: string;
  /** `{url}`: «Тариф і оплата». */
  act: string;
}

/** Billing (ADR 0018 [P12]): a renewal charge failed; the plan is in its grace period. */
export const BILLING_RENEWAL_FAILED_COPY: Readonly<Record<MailLocale, BillingRenewalFailedCopy>> = {
  uk: {
    subject: 'Stepler: не вдалося списати оплату за тариф',
    heading: 'Не вдалося списати оплату',
    text: 'Банк не підтвердив щомісячне списання за тариф «{plan}». LiqPay спробує ще кілька разів.',
    grace:
      'Усе працює як раніше до {date}. Якщо оплата не пройде, колекції стануть доступні лише для перегляду.',
    act: 'Перевірте картку або оформіть тариф знову: {url}',
  },
  en: {
    subject: 'Stepler: we could not charge your plan',
    heading: 'Your plan payment failed',
    text: 'Your bank did not confirm the charge for the “{plan}” plan. LiqPay will try a few more times.',
    grace:
      'Everything keeps working until {date}. If the payment does not go through, your collections become view-only.',
    act: 'Check your card or subscribe again: {url}',
  },
};

/** A date as the reader says it, in Kyiv time (billing mails). */
export function formatMailDate(locale: MailLocale, date: Date): string {
  return new Intl.DateTimeFormat(locale === 'uk' ? 'uk-UA' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Kyiv',
  }).format(date);
}
