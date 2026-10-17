import { expect, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { horizontalOverflow } from '../support/collections.js';
import { openGuestLink, showFrames, submitTextViaApi } from '../support/guest.js';
import { waitForMail } from '../support/mailpit.js';
import { uploadViaApi } from '../support/media.js';
import { OPERATOR_INBOX, signInAsOperator } from '../support/operator.js';
import { guestApi, sharedCollection } from '../support/reports.js';

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
    await showFrames(b);
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
    await showFrames(b);
    await b
      .getByRole('button', { name: /^Кадр \d+, побажання, / })
      .first()
      .click();
    const own = b.getByRole('dialog').filter({ hasText: 'Від гостя Б' });
    await expect(own).toBeVisible();
    await expect(own.getByRole('button', { name: 'Більше дій' })).toHaveCount(0);
    await b.context().close();
  });

  test('the admin sees the report, hides and shows the frame, and dismisses @desktop', async ({
    page,
    browser,
  }) => {
    await signIn(page, newEmail());
    const { collectionId, linkPath } = await sharedCollection(page);
    const baseURL = new URL(page.url()).origin;
    const a = await guestApi(baseURL, collectionId, linkPath);
    const text = await a.post(`/api/v1/guest/collections/${collectionId}/texts`, {
      data: { body: 'Кадр під скаргою' },
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    const { id: contentId } = (await text.json()) as { id: string };
    const b = await guestApi(baseURL, collectionId, linkPath);
    const report = await b.post(
      `/api/v1/guest/collections/${collectionId}/content/${contentId}/reports`,
      {
        data: { reason: 'PRIVACY', email: 'reporter@stepler.test', locale: 'uk' },
        headers: { 'idempotency-key': crypto.randomUUID() },
      },
    );
    expect(report.status()).toBe(201);
    await b.dispose();

    await page.goto(`/app/collections/${collectionId}`);
    // The state menu (F1a) counts the report; the option carries its mono count.
    const stateMenu = page.getByRole('button', { name: /^Стан:/ });
    await stateMenu.click();
    await expect(page.getByRole('menuitemcheckbox', { name: /^Зі скаргою/ })).toContainText('1');
    await page.keyboard.press('Escape');
    const tile = page.getByRole('button', { name: /^Кадр 1, .*скарга/ });
    await expect(tile).toBeVisible();
    await tile.click();
    const viewer = page.getByRole('dialog', { name: /#001/ });
    await expect(viewer).toContainText('Порушує приватність');
    expect(await page.content()).not.toContain('reporter@stepler.test');

    await viewer.getByRole('button', { name: 'Приховати від гостей' }).click();
    await expect(viewer.getByRole('button', { name: 'Показати гостям' })).toBeVisible();
    await viewer.getByRole('button', { name: 'Закрити' }).click();
    await expect(page.getByRole('button', { name: /^Кадр 1, .*приховано/ })).toBeVisible();

    // Guests no longer get it: another guest's «Усі кадри», and the contributor's own frames.
    const guest = await openGuestLink(browser, linkPath);
    await expect(guest.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(guest.getByText('Кадр під скаргою')).toHaveCount(0);
    const own = await a.get(`/api/v1/guest/collections/${collectionId}/content?scope=own`);
    expect(((await own.json()) as { items: unknown[] }).items).toHaveLength(0);

    await page.getByRole('button', { name: /^Кадр 1, / }).click();
    await viewer.getByRole('button', { name: 'Показати гостям' }).click();
    await expect(viewer.getByRole('button', { name: 'Приховати від гостей' })).toBeVisible();
    await guest.reload();
    await expect(guest.getByText('Кадр під скаргою')).toBeVisible();

    await viewer.getByRole('button', { name: 'Відхилити скарги' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Відхилити' }).click();
    await expect(viewer.getByRole('button', { name: 'Відхилити скарги' })).toHaveCount(0);
    await viewer.getByRole('button', { name: 'Закрити' }).click();
    await expect(page.getByRole('button', { name: /^Кадр 1, .*скарга/ })).toHaveCount(0);
    await stateMenu.click();
    await expect(page.getByRole('menuitemcheckbox', { name: /^Зі скаргою/ })).toContainText('0');
    await page.keyboard.press('Escape');
    await a.dispose();
    await guest.context().close();
  });

  test('the whole journey: report, operator mail, hide, decision mail, gone for guests @desktop', async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(120_000);
    // 1. The admin's collection with a shared gallery.
    await signIn(page, newEmail());
    const title = `Подорож ${crypto.randomUUID().slice(0, 8)}`;
    const { collectionId, linkPath } = await sharedCollection(page, title);
    const baseURL = new URL(page.url()).origin;

    // 2. Guest A uploads a photo; guest B reports it, leaving an address.
    const a = await openGuestLink(browser, linkPath);
    await expect(a.getByRole('heading', { level: 1 })).toBeVisible();
    const photo = await uploadViaApi(a, collectionId, 'photo.jpg');
    const reporter = `reporter-${crypto.randomUUID()}@stepler.test`;
    const b = await guestApi(baseURL, collectionId, linkPath);
    const filed = await b.post(
      `/api/v1/guest/collections/${collectionId}/content/${photo.id}/reports`,
      {
        data: {
          reason: 'PRIVACY',
          description: 'Мене зняли без дозволу',
          email: reporter,
          locale: 'uk',
        },
        headers: { 'idempotency-key': crypto.randomUUID() },
      },
    );
    expect(filed.status()).toBe(201);
    const { id: reportId } = (await filed.json()) as { id: string };

    // 3. The operator's mail: the reason and the console link, nothing else.
    const received = await waitForMail(OPERATOR_INBOX, 'нова скарга', reportId);
    expect(received.subject).toBe('Stepler: нова скарга (Порушує приватність)');
    const link = /(https?:\/\/\S+\/ops\/reports\/[0-9a-f-]{36})/.exec(received.text)?.[1];
    expect(link).toBeDefined();
    expect(received.text).not.toContain(reporter);
    expect(received.text).not.toContain(title);
    expect(received.text).not.toContain('Мене зняли без дозволу');

    // 4. The admin sees the mark and the reason, never the address.
    await page.goto(`/app/collections/${collectionId}`);
    await page.getByRole('button', { name: /^Кадр 1, .*скарга/ }).click();
    const viewer = page.getByRole('dialog', { name: /#001/ });
    await expect(viewer).toContainText('Порушує приватність');
    await expect(viewer).toContainText('Мене зняли без дозволу');
    expect(await page.content()).not.toContain(reporter);
    await viewer.getByRole('button', { name: 'Закрити' }).click();

    // 5. The operator follows the mail's link, hides the photo and marks the report actioned.
    const ops = await (await browser.newContext({ locale: 'de-DE' })).newPage();
    await signInAsOperator(ops, testInfo);
    await ops.goto(new URL(link!).pathname);
    for (const [button, confirm, reason] of [
      ['Приховати кадр', 'Приховати', 'Фото без згоди людини в кадрі'],
      ['Позначити: вжито заходів', 'Позначити', 'Кадр приховано'],
    ] as const) {
      await ops.getByRole('button', { name: button }).click();
      const dialog = ops.getByRole('dialog', { name: button });
      await dialog.getByLabel('Причина').fill(reason);
      await dialog.getByRole('button', { name: confirm, exact: true }).click();
      await expect(dialog).toBeHidden();
    }
    await expect(ops.getByText('Прихований', { exact: true })).toBeVisible();

    // 6. The reporter's decision mail.
    const decision = await waitForMail(reporter, 'вашу скаргу розглянуто');
    expect(decision.text).toContain('вжили заходів');
    expect(decision.text).not.toContain('Кадр приховано');

    // 7. Gone for guests: A's own frames, B's «Усі кадри».
    const own = await a.request.get(`/api/v1/guest/collections/${collectionId}/content?scope=own`);
    expect(((await own.json()) as { items: unknown[] }).items).toHaveLength(0);
    const all = await b.get(`/api/v1/guest/collections/${collectionId}/content?scope=all`);
    expect(((await all.json()) as { items: unknown[] }).items).toHaveLength(0);

    // 8. The admin sees the operator's hide and its reason, and cannot show the frame.
    await page.reload();
    await page.getByRole('button', { name: /^Кадр 1, .*приховано модерацією/ }).click();
    await expect(viewer).toContainText('Приховано модерацією');
    await expect(viewer).toContainText('Причина: Фото без згоди людини в кадрі');
    await expect(viewer.getByRole('button', { name: 'Показати гостям' })).toHaveCount(0);

    // 9. «Розглянуті» lists the report.
    await ops.goto('/ops/reports?status=actioned');
    await expect(ops.locator(`a[href="/ops/reports/${reportId}"]`).first()).toBeVisible();

    await b.dispose();
    for (const p of [a, ops]) await p.context().close();
  });

  test('the state filter (F1): every state, ANDed with the type @desktop', async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(90_000);
    await signIn(page, newEmail());
    const { collectionId, linkPath } = await sharedCollection(page);
    const baseURL = new URL(page.url()).origin;
    const a = await guestApi(baseURL, collectionId, linkPath);
    const texts: string[] = [];
    for (const body of ['Активний', 'Зі скаргою', 'Схований адміном', 'Схований оператором']) {
      const res = await a.post(`/api/v1/guest/collections/${collectionId}/texts`, {
        data: { body },
        headers: { 'idempotency-key': crypto.randomUUID() },
      });
      texts.push(((await res.json()) as { id: string }).id);
    }
    const [, reported, hiddenAdmin, hiddenOperator] = texts as [string, string, string, string];
    const b = await guestApi(baseURL, collectionId, linkPath);
    for (const id of [reported, hiddenOperator]) {
      const res = await b.post(`/api/v1/guest/collections/${collectionId}/content/${id}/reports`, {
        data: { reason: 'SPAM', locale: 'uk' },
        headers: { 'idempotency-key': crypto.randomUUID() },
      });
      expect(res.status()).toBe(201);
    }
    await b.dispose();
    await a.dispose();
    expect(
      (
        await page.request.post(`/api/v1/content/${hiddenAdmin}/hide`, {
          headers: { origin: baseURL },
        })
      ).status(),
    ).toBe(200);
    const ops = await (await browser.newContext({ locale: 'de-DE' })).newPage();
    await signInAsOperator(ops, testInfo);
    expect(
      (
        await ops.request.post(`/api/v1/operator/content/${hiddenOperator}/hide`, {
          data: { reason: 'Спам' },
          headers: { origin: baseURL },
        })
      ).status(),
    ).toBe(204);
    await ops.context().close();

    await page.goto(`/app/collections/${collectionId}`);
    const tiles = page.getByRole('list', { name: 'Кадри колекції' }).getByRole('button');
    await expect(tiles).toHaveCount(4);
    // F2: marked tiles carry a ring in the mark's colour; a hide's colour wins over a report's.
    const ringOf = (frame: number) =>
      page.locator(`[data-frame="${frame}"] [data-slot="frame-ring"]`);
    await expect(ringOf(1)).toHaveCount(0);
    await expect(ringOf(2)).toHaveAttribute('data-ring', 'warning');
    await expect(ringOf(3)).toHaveAttribute('data-ring', 'muted');
    await expect(ringOf(4)).toHaveAttribute('data-ring', 'destructive');
    const menu = page.getByRole('button', { name: /^Стан:/ });
    await expect(menu).toHaveText('Стан: Усі');
    const toggle = async (option: RegExp, count: string) => {
      const item = page.getByRole('menuitemcheckbox', { name: option });
      await expect(item).toContainText(count);
      await item.click();
    };
    // One state: «Активні» is the one plain frame; the menu stays open while toggling.
    await expect(menu).toHaveAttribute('aria-haspopup', 'menu');
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await toggle(/^Активні/, '1');
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page).toHaveURL(/state=active/);
    await expect(tiles).toHaveCount(1);
    await expect(tiles.first()).toHaveAccessibleName(/^Кадр 1, /);
    // Two states are OR: active + hidden by moderation.
    await toggle(/^Приховано модерацією/, '1');
    await expect(page).toHaveURL(/state=active.*state=hidden-operator/);
    await expect(tiles).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveText('Стан: 2 вибрано');
    // Clear from the menu's foot (the last item, by keyboard): everything again.
    await menu.click();
    await expect(page.getByRole('menuitem', { name: 'Скинути' })).toBeVisible();
    await page.keyboard.press('End');
    await expect(page.getByRole('menuitem', { name: 'Скинути' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).not.toHaveURL(/state=/);
    await expect(menu).toHaveText('Стан: Усі');
    await expect(tiles).toHaveCount(4);
    // «Зі скаргою» counts hidden frames too; «Приховано адміністратором» names its frame.
    await menu.click();
    await toggle(/^Зі скаргою/, '2');
    await expect(tiles).toHaveCount(2);
    await toggle(/^Зі скаргою/, '2');
    await toggle(/^Приховано адміністратором/, '1');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveText('Стан: Приховано адміністратором');
    await expect(tiles).toHaveCount(1);
    await expect(tiles.first()).toHaveAccessibleName(/^Кадр 3, .*приховано$/);
    // ANDed with the type: no hidden photos → the empty state names the state, «Показати все».
    await page.getByRole('radio', { name: /^Фото/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Немає кадрів, прихованих адміністратором' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Показати все' }).click();
    await expect(page).not.toHaveURL(/state=/);
    await expect(tiles).toHaveCount(4);
    // No «Вибрати» button any more (owner 2026-10-16): each tile has its own check.
    await expect(page.getByRole('button', { name: 'Вибрати', exact: true })).toHaveCount(0);
  });
});
