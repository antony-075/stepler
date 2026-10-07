import { describe, expect, test } from 'vitest';
import { renderReportDecisionEmail } from './report-decision.js';
import { renderReportReceivedEmail } from './report-received.js';

describe('the operator’s «нова скарга» mail', () => {
  test('the uk reason and the console link, nothing else', () => {
    // Over-filled on purpose: the renderer takes only what it needs.
    const input = {
      reason: 'PRIVACY' as const,
      url: 'https://stepler.app/ops/reports/0199',
      description: 'Це я на фото',
      title: 'Весілля Олени',
      email: 'r@stepler.test',
    };
    const mail = renderReportReceivedEmail(input);
    expect(mail.subject).toBe('Stepler: нова скарга (Порушує приватність)');
    for (const part of [mail.text, mail.html]) {
      expect(part).toContain('https://stepler.app/ops/reports/0199');
      expect(part).toContain('Причина: Порушує приватність');
      expect(part).not.toContain('Це я на фото');
      expect(part).not.toContain('Весілля Олени');
      expect(part).not.toContain('r@stepler.test');
    }
    expect(mail.text).toContain('Надійшла нова скарга на вміст.');
  });
});

describe('the reporter’s decision mail', () => {
  test('in the reporter’s language, with the contact when set', () => {
    const en = renderReportDecisionEmail({
      status: 'ACTIONED',
      locale: 'en',
      contactEmail: 'legal@stepler.test',
    });
    expect(en.subject).toBe('Stepler: your report has been reviewed');
    expect(en.text).toContain('We reviewed your report and took action.');
    expect(en.text).toContain('If you disagree with the decision, write to legal@stepler.test.');
    const uk = renderReportDecisionEmail({ status: 'DISMISSED', locale: 'uk' });
    expect(uk.subject).toBe('Stepler: вашу скаргу розглянуто');
    expect(uk.text).toContain('Ми розглянули вашу скаргу: порушення не підтвердилося.');
    expect(uk.text).not.toContain('напишіть на');
    expect(uk.html).not.toContain('mailto:');
  });

  test('the contact is escaped in the HTML', () => {
    const mail = renderReportDecisionEmail({
      status: 'DISMISSED',
      locale: 'uk',
      contactEmail: '<script>@x.test',
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;@x.test');
  });
});
