import { expect, test } from 'vitest';
import { renderAccountBlockedEmail } from './account-blocked.js';

test('the blocked notice: no link, the contact when set, escaped', () => {
  const uk = renderAccountBlockedEmail({ locale: 'uk', contactEmail: 'legal@stepler.test' });
  expect(uk.subject).toBe('Stepler: акаунт заблоковано');
  expect(uk.text).toContain('відновити пароль зараз не можна');
  expect(uk.text).toContain('legal@stepler.test');
  expect(uk.text).not.toContain('http');
  const en = renderAccountBlockedEmail({ locale: 'en' });
  expect(en.text).toContain('Your Stepler account is blocked');
  expect(en.html).not.toContain('mailto:');
  expect(
    renderAccountBlockedEmail({ locale: 'uk', contactEmail: '<b>@x.test' }).html,
  ).not.toContain('<b>');
});
