export type MailLocale = 'uk' | 'en';

type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

/** What an account mail is for (ADR 0019). */
export type AuthMailKind = 'verify' | 'reset' | 'exists';

interface AuthMailCopy {
  subject: string;
  heading: string;
  intro: string;
  /** `null`: the mail carries no button (only the account-exists notice links to two pages). */
  button: string;
  /** `{duration}` is replaced with the number and the unit in the correct plural form. */
  expiry: string | null;
  ignore: string;
}

interface DurationForms {
  minutes: PluralForms;
  hours: PluralForms;
}

/** Account mails (uk default, en). */
export const AUTH_MAIL_COPY: Readonly<
  Record<MailLocale, Record<AuthMailKind, AuthMailCopy> & { fallback: string } & DurationForms>
> = {
  uk: {
    verify: {
      subject: 'Підтвердіть пошту для Stepler',
      heading: 'Підтвердіть свою пошту',
      intro: 'Ви створили акаунт у Stepler. Натисніть кнопку, щоб підтвердити цю адресу й увійти.',
      button: 'Підтвердити пошту',
      expiry: 'Посилання діє {duration} і працює один раз.',
      ignore: 'Якщо ви не створювали акаунт, просто проігноруйте цей лист.',
    },
    reset: {
      subject: 'Новий пароль для Stepler',
      heading: 'Задайте новий пароль',
      intro:
        'Ми отримали запит на новий пароль для вашого акаунта. Натисніть кнопку, щоб його задати.',
      button: 'Задати пароль',
      expiry:
        'Посилання діє {duration} і працює один раз. Після зміни пароля всі інші входи завершаться.',
      ignore: 'Якщо ви не просили новий пароль, проігноруйте цей лист: старий продовжує діяти.',
    },
    exists: {
      subject: 'Ваш акаунт у Stepler уже є',
      heading: 'Акаунт із цією поштою вже є',
      intro:
        'Хтось спробував створити новий акаунт Stepler з вашою адресою. Акаунт уже існує: увійдіть або задайте новий пароль, якщо забули його.',
      button: 'Увійти',
      expiry: null,
      ignore: 'Якщо це були не ви, нічого робити не потрібно.',
    },
    fallback: 'Якщо кнопка не працює, відкрийте це посилання:',
    minutes: { one: 'хвилину', few: 'хвилини', many: 'хвилин', other: 'хвилини' },
    hours: { one: 'годину', few: 'години', many: 'годин', other: 'години' },
  },
  en: {
    verify: {
      subject: 'Confirm your e-mail for Stepler',
      heading: 'Confirm your e-mail',
      intro: 'You created a Stepler account. Use the button to confirm this address and sign in.',
      button: 'Confirm e-mail',
      expiry: 'The link is valid for {duration} and works once.',
      ignore: "If you didn't create an account, ignore this e-mail.",
    },
    reset: {
      subject: 'A new password for Stepler',
      heading: 'Set a new password',
      intro: 'We received a request for a new password for your account. Use the button to set it.',
      button: 'Set password',
      expiry:
        'The link is valid for {duration} and works once. Changing the password signs out every other session.',
      ignore: "If you didn't ask for a new password, ignore this e-mail: the old one still works.",
    },
    exists: {
      subject: 'You already have a Stepler account',
      heading: 'An account with this e-mail exists',
      intro:
        'Someone tried to create a new Stepler account with your address. The account already exists: sign in, or set a new password if you forgot it.',
      button: 'Sign in',
      expiry: null,
      ignore: "If this wasn't you, there's nothing to do.",
    },
    fallback: "If the button doesn't work, open this link:",
    minutes: { one: 'minute', other: 'minutes' },
    hours: { one: 'hour', other: 'hours' },
  },
};

function formatDuration(locale: MailLocale, value: number, forms: PluralForms): string {
  const rule = new Intl.PluralRules(locale).select(value);
  return `${value} ${forms[rule] ?? forms.other}`;
}

export function formatMinutes(locale: MailLocale, minutes: number): string {
  return formatDuration(locale, minutes, AUTH_MAIL_COPY[locale].minutes);
}

export function formatHours(locale: MailLocale, hours: number): string {
  return formatDuration(locale, hours, AUTH_MAIL_COPY[locale].hours);
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

/** Instead of a confirmation or reset mail, to a blocked account's own mailbox ([Q3], slice 9; ADR 0019). */
export const ACCOUNT_BLOCKED_COPY: Readonly<Record<MailLocale, AccountBlockedCopy>> = {
  uk: {
    subject: 'Stepler: акаунт заблоковано',
    heading: 'Акаунт заблоковано',
    text: 'Ваш акаунт Stepler заблоковано: увійти в нього чи відновити пароль зараз не можна.',
    contact: 'Якщо ви не згодні, напишіть на {email}.',
  },
  en: {
    subject: 'Stepler: account blocked',
    heading: 'Account blocked',
    text: 'Your Stepler account is blocked: you cannot sign in to it or reset its password.',
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

/**
 * A monthly ↔ yearly switch at the period end (owner decision B14): the old LiqPay subscription
 * is stopped and the new one waits for the owner to confirm it through a checkout.
 */
export const BILLING_SWITCH_CONFIRM_COPY: Readonly<Record<MailLocale, BillingRenewalFailedCopy>> = {
  uk: {
    subject: 'Stepler: підтвердіть новий спосіб оплати тарифу',
    heading: 'Підтвердіть оплату тарифу',
    text: 'Ви обрали інший період оплати тарифу «{plan}». Попередню підписку зупинено, нову треба підтвердити в LiqPay.',
    grace:
      'Усе працює як раніше до {date}. Якщо нову підписку не підтвердити, колекції стануть доступні лише для перегляду.',
    act: 'Підтвердити оплату: {url}',
  },
  en: {
    subject: 'Stepler: confirm your new billing period',
    heading: 'Confirm your plan payment',
    text: 'You chose another billing period for the “{plan}” plan. The previous subscription has stopped; confirm the new one with LiqPay.',
    grace:
      'Everything keeps working until {date}. If the new subscription is not confirmed, your collections become view-only.',
    act: 'Confirm the payment: {url}',
  },
};

/** A date as the reader says it, in Kyiv time (billing mails). */
export function formatMailDate(locale: MailLocale, date: Date): string {
  // uk-UA ends with « р.»; dropped, so a date at the end of a sentence does not end in «р..».
  const formatted = new Intl.DateTimeFormat(locale === 'uk' ? 'uk-UA' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Kyiv',
  }).format(date);
  return formatted.replace(/\s*р\.$/u, '');
}
