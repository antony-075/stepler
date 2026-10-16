import { mkdirSync, readFileSync } from 'node:fs';
import { type Browser, expect, type Page } from '@playwright/test';
import {
  saveGuestPageDraftViaApi,
  setDraftCoverFromFrameViaApi,
  waitForContentProcessed,
  waitForImageReady,
} from '../support/collections.js';
import { mainLinkPath, submitTextViaApi } from '../support/guest.js';
import { composeFilm, duration, grabFrame, renderFrame, type Scene } from './compose.js';
import { humanClick, humanTap, showPointer, startScreencast } from './screencast.js';
import { demoAdmin, guestJoin, PHOTOS_DIR, SCRATCH, shareGallery, uploadFile } from './seed.js';
import {
  DESKTOP,
  desktopContext,
  type Locale,
  OUT,
  PHONE,
  phoneContext,
  setProfileLocale,
  settle,
  shareButton,
  ui,
  writeWebp,
} from './ui.js';

/** The film's words, one per scene (also its captions). */
export const LABELS: Record<Locale, string[]> = {
  uk: [
    'Створіть колекцію',
    'Оберіть вигляд сторінки для гостей',
    'Поділіться QR-кодом',
    'Гості додають фото — без застосунку',
    'І пишуть побажання',
    'Усе — в одній колекції',
  ],
  en: [
    'Create a collection',
    'Pick how the guest page looks',
    'Share the QR code',
    'Guests add photos — no app needed',
    'And write their wishes',
    'Everything in one collection',
  ],
};

const COPY: Record<
  Locale,
  {
    title: string;
    welcome: string;
    wish: string;
    earlierWish: string;
    guest: string;
    others: string[];
  }
> = {
  uk: {
    title: 'Весілля Олі та Тараса',
    welcome: 'Дякуємо, що ви з нами! Додайте свої фото й відео з нашого дня.',
    wish: 'Олю, Тарасе, щастя вам і світла!',
    earlierWish: 'Гірко! Дякуємо за неймовірний вечір.',
    guest: 'Марія',
    others: ['Ірина', 'Андрій'],
  },
  en: {
    title: 'Olya & Taras’s wedding',
    welcome: 'Thank you for being with us! Add your photos and videos from our day.',
    wish: 'Olya, Taras, all the happiness to you!',
    earlierWish: 'Thank you for an unforgettable evening!',
    guest: 'Maria',
    others: ['Iryna', 'Andriy'],
  },
};

/** What other guests had added before the filmed one (off camera). */
const EARLIER = [
  'wedding-stairs.jpg',
  'wedding-table.jpg',
  'party-sparklers.jpg',
  'party-toast.jpg',
  'party-friends.jpg',
  'wedding-rings.jpg',
];
/** What the filmed guest picks: three photos and the short clip. */
const PICKED = [
  'wedding-bench.jpg',
  'wedding-sunset.jpg',
  'wedding-bouquet.jpg',
  'wedding-evening.mp4',
];
const DEVICES = ['desktop', 'desktop', 'desktop', 'phone', 'phone', 'desktop'] as const;

const origin = (page: Page) => ({ origin: new URL(page.url()).origin });
const PHONE_PIXELS = { width: PHONE.width * 2, height: PHONE.height * 2 };

/**
 * Films the walkthrough in `locale` from the real app, then composes it (compose.ts) into
 * `video/walkthrough-{locale}.{mp4,webm,vtt}` and its poster. Off camera between scenes: the
 * frames earlier guests added, a cover and the welcome message (time passes at a cut).
 */
export async function recordWalkthrough(
  browser: Browser,
  baseURL: string,
  locale: Locale,
): Promise<void> {
  const work = `${SCRATCH}walkthrough-${locale}`;
  mkdirSync(work, { recursive: true });
  const copy = COPY[locale];
  const clips: string[] = [];
  const clip = (n: number) => {
    clips.push(`${work}/s${n}.mp4`);
    return clips.at(-1)!;
  };

  // A new organiser of their own for each film: the story starts at an empty dashboard, and a
  // rerun never meets the daily collection-creation limit of the stills' account.
  const organiser = await demoAdmin(browser);
  const storage = await organiser.context.storageState();
  await organiser.context.close();
  console.log(`walkthrough ${locale} account: ${organiser.email}`);
  const adminContext = await desktopContext(browser, baseURL, locale, storage, 1);
  const admin = await adminContext.newPage();
  await setProfileLocale(admin, baseURL, locale);
  await showPointer(admin, 'mouse');

  // 1. Create a collection.
  await admin.goto('/app');
  await settle(admin, 800);
  await admin.mouse.move(980, 640);
  let cast = await startScreencast(admin, `${work}/s1`, DESKTOP);
  await admin.waitForTimeout(350);
  await humanClick(
    admin,
    admin.getByRole('button', { name: ui(locale, 'collections.new') }).first(),
  );
  const dialog = admin.getByRole('dialog', { name: ui(locale, 'collections.create.title') });
  const titleField = dialog.getByLabel(ui(locale, 'collections.form.title'));
  await expect(titleField).toBeFocused();
  await admin.waitForTimeout(200);
  await titleField.pressSequentially(copy.title, { delay: 42 });
  await admin.waitForTimeout(250);
  await humanClick(
    admin,
    dialog.getByRole('button', { name: ui(locale, 'collections.create.submit') }),
  );
  await admin.waitForURL(/\/app\/collections\/[0-9a-f-]{36}$/);
  await settle(admin, 500);
  await cast.stop(clip(1));
  const id = /\/app\/collections\/([0-9a-f-]{36})$/.exec(admin.url())![1]!;

  // Off camera: earlier guests' frames, a cover from one of them, the welcome in the draft.
  await shareGallery(admin, id);
  const path = await mainLinkPath(admin, id);
  let frames = 0;
  let coverId = '';
  for (const [i, name] of copy.others.entries()) {
    const { context, page } = await guestJoin(browser, path);
    await page.request.patch(`/api/v1/guest/collections/${id}/session`, {
      data: { name },
      headers: origin(page),
    });
    for (const photo of EARLIER.filter((_, n) => n % 2 === i)) {
      const frame = await uploadFile(
        page,
        id,
        `${PHOTOS_DIR}${photo}`,
        photo.replace(/^[a-z]+-/, 'IMG_'),
      );
      if (photo === 'wedding-stairs.jpg') coverId = frame.id;
      frames += 1;
    }
    if (i === 1) {
      await submitTextViaApi(page, id, copy.earlierWish);
      frames += 1;
    }
    await context.close();
  }
  await waitForContentProcessed(admin, id, frames, 120_000);
  await setDraftCoverFromFrameViaApi(admin, id, coverId);
  await saveGuestPageDraftViaApi(admin, id, { welcomeMessage: copy.welcome });
  await waitForImageReady(admin, id, 'draft', 60_000);

  // 2. Pick the guest page's look («Листівка»), then «Зберегти».
  await admin.goto(`/app/collections/${id}?tab=appearance`);
  await expect(admin.frameLocator('iframe').first().locator('[data-template]')).toBeVisible({
    timeout: 30_000,
  });
  await settle(admin, 2000);
  await admin.mouse.move(900, 520);
  cast = await startScreencast(admin, `${work}/s2`, DESKTOP);
  await admin.waitForTimeout(350);
  await humanClick(admin, admin.locator('[data-template-option="postcard"]'));
  await expect(
    admin.frameLocator('iframe').first().locator('[data-template="postcard"]'),
  ).toBeVisible({ timeout: 15_000 });
  await settle(admin, 600);
  await humanClick(
    admin,
    admin.getByRole('button', { name: new RegExp(`^${ui(locale, 'guestPage.actions.save')}`) }),
  );
  await admin.waitForTimeout(800);
  await cast.stop(clip(2));
  await waitForImageReady(admin, id, 'published', 60_000);

  // 3. Share the QR code.
  await admin.goto('/app');
  await settle(admin, 900);
  await admin.mouse.move(760, 620);
  cast = await startScreencast(admin, `${work}/s3`, DESKTOP);
  await admin.waitForTimeout(300);
  await humanClick(admin, shareButton(admin, locale, copy.title));
  const share = admin.getByRole('dialog', { name: ui(locale, 'share.title') });
  await expect(share).toBeVisible();
  await settle(admin, 200);
  const qr = (await share.getByRole('img').first().boundingBox())!;
  await admin.mouse.move(qr.x + qr.width * 0.75, qr.y + qr.height * 0.85, { steps: 22 });
  await admin.waitForTimeout(1100);
  await cast.stop(clip(3));
  await admin.keyboard.press('Escape');

  // A guest's phone: joined once and named, so no prompt interrupts the film.
  const guestContext = await phoneContext(browser, baseURL, locale);
  const guest = await guestContext.newPage();
  await showPointer(guest, 'touch');
  const joined = guest.waitForResponse(
    (res) => /\/session$/.test(res.url()) && res.request().method() === 'POST',
  );
  await guest.goto(path);
  await joined;
  await guest.request.patch(`/api/v1/guest/collections/${id}/session`, {
    data: { name: copy.guest },
    headers: origin(guest),
  });
  await guest.reload();
  await guest.locator('[data-template="postcard"]').first().waitFor();
  await settle(guest, 1200);

  // 4. Add photos and a video, no app. A slower uplink, so the progress can be seen.
  const cdp = await guestContext.newCDPSession(guest);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 80,
    downloadThroughput: 4_000_000,
    uploadThroughput: 650_000,
  });
  cast = await startScreencast(guest, `${work}/s4`, PHONE_PIXELS);
  await guest.waitForTimeout(350);
  const chooser = guest.waitForEvent('filechooser');
  await humanTap(
    guest,
    guest.getByRole('button', { name: ui(locale, 'guest.addPhotosVideos') }).first(),
  );
  await (
    await chooser
  ).setFiles(
    PICKED.map((name) => (name.endsWith('.mp4') ? `${SCRATCH}${name}` : `${PHOTOS_DIR}${name}`)),
  );
  const sheet = guest.getByRole('dialog', { name: ui(locale, 'guest.upload.sheet.title') });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(ui(locale, 'guest.upload.doneTitle'))).toBeVisible({
    timeout: 90_000,
  });
  await guest.waitForTimeout(900);
  await cast.stop(clip(4));
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await sheet.getByRole('button', { name: ui(locale, 'guest.upload.sheet.fold') }).click();
  await expect(sheet).toBeHidden();
  await settle(guest, 600);

  // 5. Write a wish.
  cast = await startScreencast(guest, `${work}/s5`, PHONE_PIXELS);
  await guest.waitForTimeout(300);
  await humanTap(guest, guest.getByRole('button', { name: ui(locale, 'guest.writeWish') }).first());
  const composer = guest.getByRole('dialog', { name: ui(locale, 'guest.composer.title') });
  await expect(composer).toBeVisible();
  await guest.waitForTimeout(200);
  await composer
    .getByRole('textbox', { name: ui(locale, 'guest.composer.label') })
    .pressSequentially(copy.wish, { delay: 38 });
  await guest.waitForTimeout(250);
  await humanTap(guest, composer.getByRole('button', { name: ui(locale, 'guest.composer.send') }));
  await expect(composer).toBeHidden();
  await guest.waitForTimeout(600);
  await cast.stop(clip(5));
  await guestContext.close();

  // 6. Everything in one collection: the admin's content, the newest first.
  await waitForContentProcessed(admin, id, frames + PICKED.length + 1, 120_000);
  await admin.goto(`/app/collections/${id}`);
  await settle(admin, 1000);
  await admin.mouse.move(1300, 760);
  cast = await startScreencast(admin, `${work}/s6`, DESKTOP);
  await admin.waitForTimeout(300);
  const newest = (await admin.locator('[data-slot="frame"]').first().boundingBox())!;
  await admin.mouse.move(newest.x + newest.width / 2, newest.y + newest.height / 2, { steps: 24 });
  await admin.waitForTimeout(1500);
  await cast.stop(clip(6));
  await adminContext.close();

  // The film.
  const scenes: Scene[] = [];
  for (const [i, file] of clips.entries()) {
    const frame = `${work}/frame-${i}.png`;
    await renderFrame(browser, DEVICES[i]!, LABELS[locale][i]!, i + 1, clips.length, frame);
    scenes.push({
      clip: file,
      device: DEVICES[i]!,
      label: LABELS[locale][i]!,
      frame,
      duration: duration(file),
    });
  }
  mkdirSync(`${OUT}video`, { recursive: true });
  const base = `${OUT}video/walkthrough-${locale}`;
  const cues = composeFilm(scenes, work, {
    mp4: `${base}.mp4`,
    webm: `${base}.webm`,
    vtt: `${base}.vtt`,
  });
  // The poster: the guest's upload sheet, the film's core moment.
  const upload = cues[3]!;
  grabFrame(`${work}/joined.mp4`, upload.end - 1.2, `${work}/poster.png`);
  await writeWebp(readFileSync(`${work}/poster.png`), `video/walkthrough-${locale}-poster.webp`, {
    quality: 80,
  });
}
