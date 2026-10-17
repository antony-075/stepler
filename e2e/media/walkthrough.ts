import { mkdirSync, readFileSync } from 'node:fs';
import { type Browser, expect, type Page } from '@playwright/test';
import { waitForContentProcessed } from '../support/collections.js';
import { mainLinkPath, submitTextViaApi } from '../support/guest.js';
import {
  composeFilm,
  duration,
  grabFrame,
  onCanvas,
  renderFrame,
  type Scene,
  type Zoom,
} from './compose.js';
import { type PickerTile, pickInGallery, prepareGallery } from './picker.js';
import {
  glide,
  humanClick,
  humanTap,
  humanType,
  showPointer,
  startScreencast,
} from './screencast.js';
import {
  demoAdmin,
  guestJoin,
  PHOTOS_DIR,
  publishLook,
  SCRATCH,
  shareGallery,
  uploadFile,
} from './seed.js';
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
    'Поділіться QR-кодом',
    'Гості відкривають сторінку свята',
    'Вибирають фото й відео — без застосунку',
    'І пишуть побажання',
    'Усе — в одній колекції',
  ],
  en: [
    'Create a collection',
    'Share the QR code',
    'Guests open your event page',
    'They pick photos and videos — no app',
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
    title: 'Olia & Taras’s wedding',
    welcome: 'Thank you for being with us! Add your photos and videos from our day.',
    wish: 'Olia, Taras, all the happiness to you!',
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
const DEVICES = ['desktop', 'desktop', 'phone', 'phone', 'phone', 'desktop'] as const;
/** The phone's gallery in the picker: the picked files first among others on the phone. */
const GALLERY_EXTRA = [
  'party-dinner.jpg',
  'trip-lake.jpg',
  'family-park.jpg',
  'birthday-cake.jpg',
  'trip-selfie.jpg',
  'party-friends.jpg',
  'corporate-team.jpg',
  'family-hug.jpg',
  'trip-hill.jpg',
  'family-kitchen.jpg',
  'birthday-balloons.jpg',
  'corporate-cheer.jpg',
  'family-picnic.jpg',
  'trip-hikers.jpg',
];
/** Where the picked files sit in the gallery (not simply the first four). */
const PICKED_AT = [1, 5, 8, 12];

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
  const zooms: (Zoom | undefined)[] = [];
  const clip = (n: number, zoom?: Zoom) => {
    clips.push(`${work}/s${n}.mp4`);
    zooms.push(zoom);
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

  // 1. Create a collection: one continuous take, from the empty dashboard to the new page.
  await admin.goto('/app');
  await settle(admin, 800);
  await glide(admin, 980, 640, 1);
  let cast = await startScreencast(admin, `${work}/s1`, DESKTOP);
  await admin.waitForTimeout(500);
  await humanClick(
    admin,
    admin.getByRole('button', { name: ui(locale, 'collections.new') }).first(),
  );
  const dialog = admin.getByRole('dialog', { name: ui(locale, 'collections.create.title') });
  const titleField = dialog.getByLabel(ui(locale, 'collections.form.title'));
  await expect(titleField).toBeFocused();
  await admin.waitForTimeout(450);
  await humanType(admin, titleField, copy.title);
  await admin.waitForTimeout(400);
  const submit = dialog.getByRole('button', { name: ui(locale, 'collections.create.submit') });
  const submitBox = (await submit.boundingBox())!;
  await humanClick(admin, submit);
  await admin.waitForURL(/\/app\/collections\/[0-9a-f-]{36}$/);
  await settle(admin, 900);
  await cast.stop(
    clip(1, {
      to: 1.07,
      focus: onCanvas('desktop', submitBox.x - 170, submitBox.y - 60, DESKTOP),
      from: 0.15,
      until: 0.55,
    }),
  );
  const id = /\/app\/collections\/([0-9a-f-]{36})$/.exec(admin.url())![1]!;

  // Off camera: earlier guests' frames, the «Листівка» look with a cover and the welcome.
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
  await publishLook(admin, id, 'postcard', coverId, copy.welcome);

  // 2. Share the QR code: the pointer finds the row's «Поділитися», the dialog opens, the camera
  // leans in on the code.
  await admin.goto('/app');
  await settle(admin, 900);
  cast = await startScreencast(admin, `${work}/s2`, DESKTOP);
  await admin.waitForTimeout(450);
  await humanClick(admin, shareButton(admin, locale, copy.title));
  const share = admin.getByRole('dialog', { name: ui(locale, 'share.title') });
  await expect(share).toBeVisible();
  await settle(admin, 300);
  const qr = (await share.getByRole('img').first().boundingBox())!;
  await glide(admin, qr.x + qr.width * 0.8, qr.y + qr.height * 0.9);
  await admin.waitForTimeout(1900);
  await cast.stop(
    clip(2, {
      to: 1.22,
      focus: onCanvas('desktop', qr.x + qr.width / 2, qr.y + qr.height / 2 + 40, DESKTOP),
      from: 0.35,
      until: 0.85,
    }),
  );
  await admin.keyboard.press('Escape');

  // The admin's «Вміст» stays open (off camera) while the guest adds; it is filmed at the end.
  await admin.goto(`/app/collections/${id}`);
  await settle(admin, 800);

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
  await guest.goto('about:blank');

  // 3. The guest opens the page (as from the QR code) and looks it over.
  cast = await startScreencast(guest, `${work}/s3`, PHONE_PIXELS);
  await guest.goto(path);
  await guest.locator('[data-template="postcard"]').first().waitFor();
  await settle(guest, 900);
  await guest.mouse.wheel(0, 0);
  await guest.evaluate(() => window.scrollTo({ top: 260, behavior: 'smooth' }));
  await guest.waitForTimeout(1300);
  await guest.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await guest.waitForTimeout(1000);
  await cast.stop(clip(3));

  // 4. Add photos and a video, no app: the phone's picker, then the real upload. A slower
  // uplink, so the progress can be seen.
  const cdp = await guestContext.newCDPSession(guest);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 80,
    downloadThroughput: 4_000_000,
    uploadThroughput: 900_000,
  });
  const picks: PickerTile[] = PICKED.map((name) =>
    name.endsWith('.mp4')
      ? { file: `${SCRATCH}${name}`, video: { length: '0:06' } }
      : { file: `${PHOTOS_DIR}${name}` },
  );
  const gallery: PickerTile[] = GALLERY_EXTRA.map((name) => ({ file: `${PHOTOS_DIR}${name}` }));
  PICKED_AT.forEach((at, i) => gallery.splice(at, 0, picks[i]!));
  const prepared = await prepareGallery(gallery);
  cast = await startScreencast(guest, `${work}/s4`, PHONE_PIXELS);
  await guest.waitForTimeout(400);
  const chooser = guest.waitForEvent('filechooser');
  await humanTap(
    guest,
    guest.getByRole('button', { name: ui(locale, 'guest.addPhotosVideos') }).first(),
  );
  await pickInGallery(guest, await chooser, locale, prepared, PICKED_AT);
  const sheet = guest.getByRole('dialog', { name: ui(locale, 'guest.upload.sheet.title') });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(ui(locale, 'guest.upload.doneTitle'))).toBeVisible({
    timeout: 90_000,
  });
  await guest.waitForTimeout(1200);
  await cast.stop(clip(4, { to: 1.06, focus: { x: 960, y: 820 }, from: 0.5, until: 0.9 }));
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
  await guest.waitForTimeout(400);
  await humanTap(guest, guest.getByRole('button', { name: ui(locale, 'guest.writeWish') }).first());
  const composer = guest.getByRole('dialog', { name: ui(locale, 'guest.composer.title') });
  await expect(composer).toBeVisible();
  await guest.waitForTimeout(450);
  await humanType(
    guest,
    composer.getByRole('textbox', { name: ui(locale, 'guest.composer.label') }),
    copy.wish,
  );
  await guest.waitForTimeout(450);
  await humanTap(guest, composer.getByRole('button', { name: ui(locale, 'guest.composer.send') }));
  await expect(composer).toBeHidden();
  await guest.waitForTimeout(900);
  await cast.stop(clip(5));
  await guestContext.close();

  // 6. Everything in one collection: the admin, still on «Вміст», refreshes and the new frames
  // arrive at the top.
  await waitForContentProcessed(admin, id, frames + PICKED.length + 1, 120_000);
  await admin.bringToFront();
  await glide(admin, 1100, 700, 1);
  cast = await startScreencast(admin, `${work}/s6`, DESKTOP);
  await admin.waitForTimeout(500);
  await humanClick(
    admin,
    admin.getByRole('button', { name: ui(locale, 'content.refresh') }).first(),
  );
  await settle(admin, 700);
  const newest = (await admin.locator('[data-slot="frame"]').first().boundingBox())!;
  await glide(admin, newest.x + newest.width / 2, newest.y + newest.height / 2);
  await admin.waitForTimeout(1800);
  await cast.stop(
    clip(6, {
      to: 1.1,
      focus: onCanvas('desktop', newest.x + 260, newest.y + 160, DESKTOP),
      from: 0.3,
      until: 0.8,
    }),
  );
  await adminContext.close();

  // The film.
  const scenes: Scene[] = [];
  for (const [i, file] of clips.entries()) {
    const frame = await renderFrame(
      browser,
      DEVICES[i]!,
      LABELS[locale][i]!,
      i + 1,
      clips.length,
      `${work}/frame-${i}.png`,
    );
    scenes.push({
      clip: file,
      device: DEVICES[i]!,
      label: LABELS[locale][i]!,
      frame,
      duration: duration(file),
      zoom: zooms[i],
    });
  }
  mkdirSync(`${OUT}video`, { recursive: true });
  const base = `${OUT}video/walkthrough-${locale}`;
  const cues = composeFilm(scenes, work, {
    mp4: `${base}.mp4`,
    webm: `${base}.webm`,
    vtt: `${base}.vtt`,
  });
  // The poster: the guest's phone mid-upload, the film's core moment.
  const upload = cues[3]!;
  grabFrame(
    `${work}/joined.mp4`,
    upload.start + (upload.end - upload.start) * 0.62,
    `${work}/poster.png`,
  );
  await writeWebp(readFileSync(`${work}/poster.png`), `video/walkthrough-${locale}-poster.webp`, {
    quality: 80,
  });
}
