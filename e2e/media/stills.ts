import { type Browser, type BrowserContext, expect, type Page } from '@playwright/test';
import { PHOTOS_DIR, type Seeded, type StorageState, type TemplateId } from './seed.js';
import {
  desktopContext,
  type Locale,
  phoneContext,
  setProfileLocale,
  settle,
  shareButton,
  ui,
  writeWebp,
} from './ui.js';

/** The guest's main tab («Додати» / «Кадри»), on phones. */
const viewTab = (page: Page, locale: Locale, view: 'add' | 'frames') =>
  page.getByRole('tab', { name: new RegExp(`^${ui(locale, `guest.views.${view}`)}`) });

/** Opens a guest link on a phone and waits for the page and its session. */
export async function openAsGuest(
  browser: Browser,
  baseURL: string,
  locale: Locale,
  path: string,
  storageState?: StorageState,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await phoneContext(browser, baseURL, locale, storageState);
  const page = await context.newPage();
  await page.goto(path);
  await page.locator('[data-template]').first().waitFor({ timeout: 60_000 });
  await settle(page, 1000);
  return { context, page };
}

/** One collection's guest page as a guest opens it: the «Додати» view, the top of the page. */
export async function guestPageStill(
  browser: Browser,
  baseURL: string,
  locale: Locale,
  template: TemplateId,
  seeded: Seeded,
): Promise<void> {
  const { context, page } = await openAsGuest(browser, baseURL, locale, seeded.path);
  await writeWebp(await page.screenshot(), `screens/${locale}/guest-${template}.webp`);
  await context.close();
}

/** The wedding's «Кадри» tab as its first guest sees it: their own frames, then everyone's. */
export async function guestFramesStill(
  browser: Browser,
  baseURL: string,
  locale: Locale,
  seeded: Seeded,
) {
  const { context, page } = await openAsGuest(browser, baseURL, locale, seeded.path, seeded.guest);
  await viewTab(page, locale, 'frames').click();
  await settle(page, 1200);
  await writeWebp(await page.screenshot(), `screens/${locale}/guest-frames.webp`);
  await context.close();
}

/** Skips the name prompt when it comes before the first contribution. */
async function skipNamePrompt(page: Page, locale: Locale): Promise<void> {
  const prompt = page.getByRole('dialog', { name: ui(locale, 'guest.name.title') });
  if (await prompt.isVisible().catch(() => false)) {
    await prompt.getByRole('button', { name: ui(locale, 'guest.name.skip') }).click();
  }
}

/**
 * The upload sheet while photos really upload: the network is throttled (CDP) so the progress
 * is caught mid-way; the shot is taken once some bytes are in and none is finished.
 */
export async function guestUploadStill(
  browser: Browser,
  baseURL: string,
  locale: Locale,
  seeded: Seeded,
) {
  const { context, page } = await openAsGuest(browser, baseURL, locale, seeded.path);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 120,
    downloadThroughput: 2_000_000,
    uploadThroughput: 90_000,
  });
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('button', { name: ui(locale, 'guest.addPhotosVideos') })
    .first()
    .click();
  const prompt = page.getByRole('dialog', { name: ui(locale, 'guest.name.title') });
  const first = await Promise.race([
    chooser.then(() => 'chooser' as const),
    prompt.waitFor({ state: 'visible' }).then(() => 'prompt' as const),
  ]);
  if (first === 'prompt')
    await prompt.getByRole('button', { name: ui(locale, 'guest.name.skip') }).click();
  await (
    await chooser
  ).setFiles(
    ['wedding-bench.jpg', 'wedding-rings.jpg', 'wedding-bouquet.jpg', 'wedding-sunset.jpg'].map(
      (name) => `${PHOTOS_DIR}${name}`,
    ),
  );
  const sheet = page.getByRole('dialog', { name: ui(locale, 'guest.upload.sheet.title') });
  await expect(sheet).toBeVisible();
  // Local previews drawn and the first file under way.
  await page.waitForTimeout(2600);
  await writeWebp(await page.screenshot(), `screens/${locale}/guest-upload.webp`);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  // Let them finish: they are real frames of the wedding now.
  await page.waitForTimeout(4000);
  await context.close();
}

/** Writing a wish: the composer with the text typed, before «Надіслати». */
export async function guestWishStill(
  browser: Browser,
  baseURL: string,
  locale: Locale,
  seeded: Seeded,
) {
  const { context, page } = await openAsGuest(browser, baseURL, locale, seeded.path);
  await page
    .getByRole('button', { name: ui(locale, 'guest.writeWish') })
    .first()
    .click();
  await skipNamePrompt(page, locale);
  const composer = page.getByRole('dialog', { name: ui(locale, 'guest.composer.title') });
  await expect(composer).toBeVisible();
  await composer
    .getByRole('textbox', { name: ui(locale, 'guest.composer.label') })
    .fill(
      locale === 'uk'
        ? 'Олю, Тарасе, дякуємо за цей вечір! Нехай кожен ваш день буде таким же світлим.'
        : 'Olia, Taras, thank you for this evening! May every day be as bright as today.',
    );
  await page.waitForTimeout(600);
  await writeWebp(await page.screenshot(), `screens/${locale}/guest-wish.webp`);
  await context.close();
}

/** A desktop screen at 1× (always) and 2× (kept only when small enough). */
async function desktopShot(page2x: Page, name: string, locale: Locale): Promise<void> {
  const png = await page2x.screenshot();
  await writeWebp(png, `screens/${locale}/${name}.webp`, { width: 1440 });
  await writeWebp(png, `screens/${locale}/${name}@2x.webp`, { maxBytes: 350_000 });
}

/** The admin's screens: the dashboard, the wedding's content, sharing, a new collection, the editor. */
export async function adminStills(
  browser: Browser,
  baseURL: string,
  locale: Locale,
  state: StorageState,
  wedding: Seeded,
  weddingTitle: string,
): Promise<void> {
  const context = await desktopContext(browser, baseURL, locale, state, 2);
  const page = await context.newPage();
  await setProfileLocale(page, baseURL, locale);

  await page.goto('/app');
  await settle(page, 1000);
  await desktopShot(page, 'admin-dashboard', locale);

  await page.goto(`/app/collections/${wedding.id}`);
  await settle(page, 1200);
  await desktopShot(page, 'admin-collection', locale);

  await page.goto('/app');
  await settle(page, 600);
  await shareButton(page, locale, weddingTitle).click();
  const share = page.getByRole('dialog', { name: ui(locale, 'share.title') });
  await expect(share).toBeVisible();
  await settle(page, 800);
  await desktopShot(page, 'admin-share', locale);
  await page.keyboard.press('Escape');

  await page.goto('/app');
  await settle(page, 600);
  await page
    .getByRole('button', { name: ui(locale, 'collections.new') })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: ui(locale, 'collections.create.title') });
  await dialog
    .getByLabel(ui(locale, 'collections.form.title'))
    .pressSequentially(weddingTitle, { delay: 30 });
  await page.waitForTimeout(500);
  await desktopShot(page, 'admin-new', locale);
  await page.keyboard.press('Escape');

  await page.goto(`/app/collections/${wedding.id}?tab=appearance`);
  await settle(page, 2500);
  await desktopShot(page, 'admin-editor', locale);
  await context.close();
}
