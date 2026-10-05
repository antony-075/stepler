import { type Browser, expect, type Locator, type Page, test } from '@playwright/test';
import { contrastRatio, definitionOf, MIN_RATIO } from '@stepler/templates/core';
import { newEmail, signIn } from '../support/auth.js';
import {
  archiveCollectionViaApi,
  createCollectionViaApi,
  horizontalOverflow,
  publishGuestPageViaApi,
  saveGuestPageDraftViaApi,
  setDraftCoverFromFrameViaApi,
  waitForContentProcessed,
  waitForImageReady,
} from '../support/collections.js';
import { guestLinks, mainLinkPath } from '../support/guest.js';
import { uploadViaApi } from '../support/media.js';

// The template matrix (plan Task 23): each of the six templates published with its defaults
// and a frame-copied cover, opened as a guest at 360px (every project) and at 1440px
// (`@desktop`). Ukrainian UI.
test.use({ locale: 'de-DE' });

const TEMPLATE_IDS = ['classic', 'fullscreen', 'journal', 'postcard', 'party', 'minimal'] as const;
type TemplateId = (typeof TEMPLATE_IDS)[number];

const origin = (page: Page) => ({ origin: new URL(page.url()).origin });

/** The first element of `locator` that takes space on screen (templates draw some twice). */
const shown = (locator: Locator) => locator.filter({ visible: true }).first();

/**
 * One signed-in admin per worker (fewer sign-ins under load); each test gets its own collection,
 * archived at the end so the active-collection limit never bites.
 */
let workerAdmin: Page | null = null;

async function signedInAdmin(browser: Browser): Promise<Page> {
  if (workerAdmin === null) {
    const context = await browser.newContext({ locale: 'de-DE' });
    workerAdmin = await context.newPage();
    await signIn(workerAdmin, newEmail());
  }
  return workerAdmin;
}

test.afterAll(async () => {
  await workerAdmin?.context().close();
  workerAdmin = null;
});

/** A collection of the worker's admin whose main link takes every kind. */
async function admin(browser: Browser, title = 'Весілля Олі та Тараса') {
  const page = await signedInAdmin(browser);
  const { id } = await createCollectionViaApi(page, title);
  const main = (await guestLinks(page, id)).find((link) => link.isDefault)!;
  const res = await page.request.patch(`/api/v1/guest-links/${main.id}`, {
    data: {
      permissions: {
        canUploadPhotos: true,
        canUploadVideos: true,
        canUploadDocuments: true,
        canSubmitText: true,
        canViewGallery: true,
        canDeleteOwn: true,
      },
    },
    headers: origin(page),
  });
  expect(res.status()).toBe(200);
  return {
    page,
    id,
    path: await mainLinkPath(page, id),
    done: () => archiveCollectionViaApi(page, id),
  };
}

/** Opens the guest link and waits for the page (and so the guest's session). */
async function join(guest: Page, path: string) {
  await guest.goto(path);
  await expect(shown(guest.getByRole('heading', { level: 1 }))).toBeVisible();
}

/**
 * Publishes `templateId` with its defaults (plus `settings`) and a cover copied from a guest's
 * photo, then reloads the guest page.
 */
async function publish(
  adminPage: Page,
  guest: Page,
  id: string,
  templateId: TemplateId,
  extra: { settings?: Record<string, unknown>; welcomeMessage?: string } = {},
) {
  const frame = await uploadViaApi(guest, id, 'photo.jpg');
  await waitForContentProcessed(adminPage, id, 1);
  await setDraftCoverFromFrameViaApi(adminPage, id, frame.id);
  const def = definitionOf(templateId)!;
  await saveGuestPageDraftViaApi(adminPage, id, {
    templateId,
    settings: { ...def.defaults, ...extra.settings },
    welcomeMessage: extra.welcomeMessage ?? 'Дякуємо, що ви з нами! Додайте свої фото й відео.',
  });
  await publishGuestPageViaApi(adminPage, id);
  await waitForImageReady(adminPage, id, 'published');
  await guest.reload();
  await expect(guest.locator(`[data-template="${templateId}"]`)).toBeVisible();
  // The guest's own frame has loaded: the page is in its contributed phase and stays there.
  await expect(
    shown(guest.locator('[data-slot="guest-own-frames"] [data-slot="frame"]')),
  ).toBeVisible();
}

/** The checks every template passes at every width. */
async function checkPage(guest: Page) {
  await expect(shown(guest.getByRole('heading', { level: 1 }))).toBeVisible();
  expect(await horizontalOverflow(guest)).toBeLessThanOrEqual(0);

  // The primary action is on the first screen.
  const primary = shown(guest.getByRole('button', { name: 'Додати фото й відео' }));
  const box = (await primary.boundingBox())!;
  const viewport = guest.viewportSize()!;
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.height).toBeGreaterThanOrEqual(44);

  // The terms notice can be reached and read.
  const notice = shown(guest.locator('[data-slot="guest-legal-notice"]'));
  await notice.scrollIntoViewIfNeeded();
  await expect(notice).toBeInViewport();

  // The footer's privacy link is reachable and nothing (a sticky bar) covers it: a trial click
  // checks that the link itself receives the pointer at its click point.
  const privacy = shown(guest.locator('footer').getByRole('link', { name: /^Політика/ }));
  await privacy.scrollIntoViewIfNeeded();
  await privacy.click({ trial: true, timeout: 5000 });

  // The primary action opens the file picker (inside the user's tap, as iOS needs); the name
  // is asked once first, and «Пропустити» goes on to the picker.
  await primary.scrollIntoViewIfNeeded();
  const chooser = guest.waitForEvent('filechooser');
  await primary.click();
  await guest
    .getByRole('dialog', { name: 'Як вас звати?' })
    .getByRole('button', { name: 'Пропустити' })
    .click();
  await chooser;
}

test.describe('guest page templates at 360px', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  for (const templateId of TEMPLATE_IDS) {
    test(`${templateId}: fits, the notice and footer are reachable, the picker opens`, async ({
      page: guest,
      browser,
    }) => {
      const owner = await admin(browser);
      await join(guest, owner.path);
      await publish(owner.page, guest, owner.id, templateId);
      await checkPage(guest);
      await owner.done();
    });
  }
});

test.describe('guest page templates at 1440px @desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const templateId of TEMPLATE_IDS) {
    test(`${templateId} @desktop`, async ({ page: guest, browser }) => {
      const owner = await admin(browser);
      await join(guest, owner.path);
      await publish(owner.page, guest, owner.id, templateId);
      await checkPage(guest);
      await owner.done();
    });
  }
});

test.describe('«Вечірка» under reduced motion', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test('nothing animates: the emblem stands still', async ({ page: guest, browser }) => {
    const owner = await admin(browser);
    await join(guest, owner.path);
    await publish(owner.page, guest, owner.id, 'party');
    await expect(guest.locator('.pt-ring')).toBeVisible();
    const running = await guest.evaluate(
      () =>
        document.getAnimations().filter((animation) => animation.playState === 'running').length,
    );
    expect(running).toBe(0);
    await owner.done();
  });
});

/** Reads a template token from the page's template root. */
const token = (guest: Page, name: string) =>
  guest
    .locator('[data-template]')
    .evaluate((root, n) => getComputedStyle(root).getPropertyValue(n).trim().toUpperCase(), name);

test.describe('Review Focus 4: a lime accent, a long title and welcome at 320px', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  for (const templateId of ['classic', 'party'] as const) {
    test(`${templateId}: every text token reads at 4.5:1; nothing scrolls sideways`, async ({
      page: guest,
      browser,
    }) => {
      const title = 'Найдовшавесільнаназваколекції'.repeat(4).slice(0, 100);
      const owner = await admin(browser, title);
      await join(guest, owner.path);
      const welcome = `Дякуємо, що ви з нами! ${'Додавайте фото й відео з вечора, '.repeat(6)}`
        .slice(0, 160)
        .trim();
      await publish(owner.page, guest, owner.id, templateId, {
        settings: { accent: '#C5F04A' },
        welcomeMessage: welcome,
      });
      expect(await horizontalOverflow(guest)).toBeLessThanOrEqual(0);
      const accent = await token(guest, '--tpl-accent');
      const bg = await token(guest, '--tpl-bg');
      const pairs: [string, string, string][] = [
        ['--tpl-on-accent', await token(guest, '--tpl-on-accent'), accent],
        ['--tpl-text', await token(guest, '--tpl-text'), bg],
        ['--tpl-accent-text', await token(guest, '--tpl-accent-text'), bg],
      ];
      for (const [name, fg, against] of pairs) {
        expect(contrastRatio(fg, against), name).toBeGreaterThanOrEqual(MIN_RATIO);
      }
      await owner.done();
    });
  }
});
