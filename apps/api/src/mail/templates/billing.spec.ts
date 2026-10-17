import { describe, expect, test } from 'vitest';
import { renderBillingDeletionWarningEmail } from './billing-deletion-warning.js';
import { renderBillingReadOnlyEmail } from './billing-read-only.js';
import { renderBillingRenewalFailedEmail } from './billing-renewal-failed.js';

const url = 'https://stepler.app/app/billing';
const deleteAfter = new Date('2027-10-07T21:30:00Z');

describe('billing mails', () => {
  test('the deletion warning names the collection and the Kyiv date, escaped', () => {
    const mail = renderBillingDeletionWarningEmail({
      locale: 'uk',
      title: 'Весілля <Олени>',
      deleteAfter,
      url,
    });
    // 21:30 UTC is already 8 October in Kyiv.
    expect(mail.subject).toBe('Stepler: колекцію «Весілля <Олени>» буде видалено 8 жовтня 2027 р.');
    expect(mail.text).toContain(url);
    expect(mail.html).toContain('Весілля &lt;Олени&gt;');
    expect(mail.html).not.toContain('<Олени>');
  });

  test('the read-only mail says why, until when and where to go, in English too', () => {
    const mail = renderBillingReadOnlyEmail({ locale: 'en', reason: 'trial', deleteAfter, url });
    expect(mail.subject).toBe('Stepler: your collections are view-only');
    expect(mail.text).toContain('Your trial has ended.');
    expect(mail.text).toContain('8 October 2027');
    expect(mail.html).toContain(`href="${url}"`);
  });

  test('a monthly ↔ yearly switch asks to confirm, not to check the card (B14)', () => {
    const input = { locale: 'uk' as const, plan: 'Pro', graceEndsAt: deleteAfter, url };
    const failed = renderBillingRenewalFailedEmail(input);
    const switched = renderBillingRenewalFailedEmail({ ...input, reason: 'switch' });
    expect(failed.subject).toBe('Stepler: не вдалося списати оплату за тариф');
    expect(switched.subject).toBe('Stepler: підтвердіть новий спосіб оплати тарифу');
    expect(switched.text).toContain('«Pro»');
    expect(switched.text).toContain('8 жовтня 2027');
    expect(switched.html).toContain(`href="${url}"`);
  });
});
