import { expect, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { horizontalOverflow } from '../support/collections.js';
import { openGuestLink, submitTextViaApi } from '../support/guest.js';
import { sharedCollection } from '../support/reports.js';

// Slice 9, R1: a guest reports another guest's frame from the viewer's «⋯». Phones and desktop.

// Ukrainian UI (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

test.describe('guest reports', () => {
  test('guest B reports guest A’s wish; the wish stays; B’s own frame has no «⋯»', async ({
    page,
    browser,
  }) => {
    await signIn(page, newEmail());
    const { collectionId, linkPath } = await sharedCollection(page);

    const a = await openGuestLink(browser, linkPath);
    await expect(a.getByRole('heading', { level: 1 })).toBeVisible();
    await submitTextViaApi(a, collectionId, 'Від гостя А');
    await a.context().close();

    const b = await openGuestLink(browser, linkPath);
    await expect(b.getByRole('heading', { level: 1 })).toBeVisible();
    const all = b.getByRole('list', { name: 'Усі кадри колекції' });
    await all.getByRole('button', { name: /^Побажання, / }).click();
    const viewer = b.getByRole('dialog').filter({ hasText: 'Від гостя А' });
    await viewer.getByRole('button', { name: 'Більше дій' }).click();
    await b.getByRole('menuitem', { name: 'Поскаржитися' }).click();

    const form = b.getByRole('dialog', { name: 'Поскаржитися' });
    await form.getByRole('radio', { name: 'Порушує приватність' }).click();
    await form.getByLabel('Ваш e-mail').fill('olena@example.com');
    expect(await horizontalOverflow(b)).toBeLessThanOrEqual(0);
    const send = form.getByRole('button', { name: 'Надіслати скаргу' });
    await send.scrollIntoViewIfNeeded();
    await expect(send).toBeInViewport();
    await send.click();
    await expect(b.getByRole('heading', { name: 'Скаргу надіслано' })).toBeVisible();
    await b.getByRole('button', { name: 'Закрити' }).first().click();
    await b.keyboard.press('Escape');

    // The frame stays in «Усі кадри» (no automatic action).
    await expect(all.getByText('Від гостя А')).toBeVisible();

    // B's own frame: no «⋯».
    await submitTextViaApi(b, collectionId, 'Від гостя Б');
    await b.reload();
    await b
      .getByRole('button', { name: /^Кадр \d+, побажання, / })
      .first()
      .click();
    const own = b.getByRole('dialog').filter({ hasText: 'Від гостя Б' });
    await expect(own).toBeVisible();
    await expect(own.getByRole('button', { name: 'Більше дій' })).toHaveCount(0);
    await b.context().close();
  });
});
