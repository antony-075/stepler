import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { type Browser, type BrowserContext, expect, type Page } from '@playwright/test';
import { definitionOf } from '@stepler/templates/core';
import { signIn } from '../support/auth.js';
import {
  createCollectionViaApi,
  publishGuestPageViaApi,
  saveGuestPageDraftViaApi,
  setDraftCoverFromFrameViaApi,
  waitForContentProcessed,
  waitForImageReady,
} from '../support/collections.js';
import { guestLinks, mainLinkPath, submitTextViaApi } from '../support/guest.js';

export type TemplateId = 'classic' | 'fullscreen' | 'journal' | 'postcard' | 'party' | 'minimal';

/** One demo collection: what guests add to it and how its guest page looks. */
export type DemoCollection = {
  key: TemplateId;
  title: string;
  description: string;
  welcome: string;
  cover: string;
  /** Each guest: a name and what they add (photo file names, wishes, videos made here). */
  guests: { name: string; photos: string[]; wishes: string[]; videos?: string[] }[];
};

export const COLLECTIONS: DemoCollection[] = [
  {
    key: 'postcard',
    title: 'Весілля Олі та Тараса',
    description: 'Субота, 14 червня',
    welcome: 'Дякуємо, що ви з нами! Додайте свої фото й відео з нашого дня.',
    cover: 'wedding-stairs.jpg',
    guests: [
      {
        name: 'Ірина',
        photos: [
          'wedding-stairs.jpg',
          'wedding-bench.jpg',
          'wedding-rings.jpg',
          'party-sparklers.jpg',
        ],
        wishes: ['Олю, Тарасе, кохайте одне одного так, як сьогодні! Найкращий день цього літа.'],
        videos: ['wedding-evening.mp4'],
      },
      {
        name: 'Андрій',
        photos: [
          'wedding-sunset.jpg',
          'wedding-table.jpg',
          'wedding-bouquet.jpg',
          'party-toast.jpg',
          'party-friends.jpg',
        ],
        wishes: ['Гірко! Дякуємо за неймовірний вечір.'],
      },
    ],
  },
  {
    key: 'classic',
    title: 'Ювілей Ніни Петрівни',
    description: '70 років, родинне свято',
    welcome: 'Діліться світлинами з нашого свята — бабуся дуже чекає на них!',
    cover: 'family-picnic.jpg',
    guests: [
      {
        name: 'Оксана',
        photos: ['family-picnic.jpg', 'family-park.jpg', 'birthday-cake.jpg'],
        wishes: ['Мамо, з ювілеєм! Здоров’я, тепла і ще багато таких вечорів разом.'],
      },
      {
        name: 'Дмитро',
        photos: ['family-kitchen.jpg', 'family-hug.jpg'],
        wishes: ['Бабусю, ми тебе дуже любимо!'],
      },
    ],
  },
  {
    key: 'party',
    title: 'День народження Марка',
    description: 'Марку 30!',
    welcome: 'Скидайте сюди всі кадри з вечірки, навіть найсмішніші.',
    cover: 'party-sparklers.jpg',
    guests: [
      {
        name: 'Софія',
        photos: ['party-sparklers.jpg', 'birthday-candles.jpg', 'birthday-balloons.jpg'],
        wishes: ['Марку, з днем народження! Нехай наступні тридцять будуть ще яскравішими.'],
      },
      {
        name: 'Олег',
        photos: ['party-toast.jpg', 'party-friends.jpg', 'birthday-fifteen.jpg'],
        wishes: ['За іменинника!'],
      },
    ],
  },
  {
    key: 'journal',
    title: 'Похід у Карпати',
    description: 'Говерла, серпень',
    welcome: 'Збираємо всі кадри з походу в одному місці. Додайте свої!',
    cover: 'trip-hill.jpg',
    guests: [
      {
        name: 'Марта',
        photos: ['trip-hill.jpg', 'trip-lake.jpg'],
        wishes: ['Найкращі три дні цього року. Їдемо ще раз восени?'],
      },
      {
        name: 'Ігор',
        photos: ['trip-selfie.jpg', 'trip-hikers.jpg'],
        wishes: ['Дякую всім за компанію і за терпіння на підйомі :)'],
      },
    ],
  },
  {
    key: 'minimal',
    title: 'Корпоратив Studio K',
    description: 'Підсумки року',
    welcome: 'Фото з вечора — сюди. Дякуємо за рік разом!',
    cover: 'corporate-cheer.jpg',
    guests: [
      {
        name: 'Наталія',
        photos: ['corporate-cheer.jpg', 'corporate-team.jpg'],
        wishes: ['Команда, ви найкращі. До зустрічі в новому році!'],
      },
      {
        name: 'Максим',
        photos: ['corporate-talk.jpg', 'corporate-phone.jpg'],
        wishes: ['Дякую за чудовий вечір!'],
      },
    ],
  },
  {
    key: 'fullscreen',
    title: 'Вечір друзів',
    description: 'П’ятниця на терасі',
    welcome: 'Додайте свої кадри з вечора — зберемо все разом.',
    cover: 'party-dinner.jpg',
    guests: [
      {
        name: 'Віка',
        photos: ['party-dinner.jpg', 'party-friends.jpg', 'party-toast.jpg'],
        wishes: ['Повторимо наступної п’ятниці!'],
      },
      {
        name: 'Тарас',
        photos: ['party-sparklers.jpg', 'birthday-balloons.jpg'],
        wishes: ['Дякую за вечір, друзі!'],
      },
    ],
  },
];

type Words = Pick<DemoCollection, 'title' | 'description' | 'welcome'> & {
  /** Each guest's name and wishes, in the order of `COLLECTIONS[n].guests`. */
  guests: { name: string; wishes: string[] }[];
};

/** The English demo set: the same collections, photos and templates, in English. */
const ENGLISH: Record<TemplateId, Words> = {
  postcard: {
    title: 'Olia & Taras’s wedding',
    description: 'Saturday, 14 June',
    welcome: 'Thank you for being with us! Add your photos and videos from our day.',
    guests: [
      {
        name: 'Iryna',
        wishes: ['Olia, Taras, love each other the way you do today! The best day of the summer.'],
      },
      { name: 'Andriy', wishes: ['Cheers to you both! Thank you for an unforgettable evening.'] },
    ],
  },
  classic: {
    title: 'Nina’s 70th birthday',
    description: 'A family celebration',
    welcome: 'Share your photos from the party — Grandma can’t wait to see them!',
    guests: [
      {
        name: 'Oksana',
        wishes: [
          'Happy birthday, Mum! Health, warmth and many more evenings like this one together.',
        ],
      },
      { name: 'Dmytro', wishes: ['Grandma, we love you so much!'] },
    ],
  },
  party: {
    title: 'Mark’s birthday',
    description: 'Mark turns 30!',
    welcome: 'Drop every shot from the party here, even the silly ones.',
    guests: [
      { name: 'Sofia', wishes: ['Happy birthday, Mark! May the next thirty be even brighter.'] },
      { name: 'Oleh', wishes: ['To the birthday boy!'] },
    ],
  },
  journal: {
    title: 'Carpathian hike',
    description: 'Hoverla, August',
    welcome: 'All the photos from the hike in one place. Add yours!',
    guests: [
      { name: 'Marta', wishes: ['The best three days of the year. Shall we go again in autumn?'] },
      {
        name: 'Ihor',
        wishes: ['Thanks, everyone, for the company and the patience on the climb :)'],
      },
    ],
  },
  minimal: {
    title: 'Studio K party',
    description: 'The year in review',
    welcome: 'Photos from the evening go here. Thank you for a great year together!',
    guests: [
      { name: 'Natalia', wishes: ['Team, you are the best. See you next year!'] },
      { name: 'Maksym', wishes: ['Thanks for a wonderful evening!'] },
    ],
  },
  fullscreen: {
    title: 'A night with friends',
    description: 'Friday on the terrace',
    welcome: 'Add your photos from tonight — let’s put them all together.',
    guests: [
      { name: 'Vika', wishes: ['Same time next Friday!'] },
      { name: 'Taras', wishes: ['Thanks for tonight, friends!'] },
    ],
  },
};

/** The demo set in a language: Ukrainian as written above, English from `ENGLISH`. */
export function collectionsFor(locale: 'uk' | 'en'): DemoCollection[] {
  if (locale === 'uk') return COLLECTIONS;
  return COLLECTIONS.map((demo) => {
    const words = ENGLISH[demo.key];
    return {
      ...demo,
      title: words.title,
      description: words.description,
      welcome: words.welcome,
      guests: demo.guests.map((guest, i) => ({ ...guest, ...words.guests[i]! })),
    };
  });
}

export const PHOTOS_DIR = fileURLToPath(
  new URL('../../apps/web/src/landing/photos/', import.meta.url),
);
export const SCRATCH =
  process.env.LANDING_MEDIA_SCRATCH ??
  fileURLToPath(new URL('../test-results/landing-media/', import.meta.url));

const apiDir = fileURLToPath(new URL('../../apps/api/', import.meta.url));

/** The local app's database (the API's `.env`), unless `LANDING_MEDIA_DATABASE_URL` says otherwise. */
function databaseUrl(): string {
  if (process.env.LANDING_MEDIA_DATABASE_URL) return process.env.LANDING_MEDIA_DATABASE_URL;
  const env = parseEnv(readFileSync(`${apiDir}.env`, 'utf8'));
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL missing in apps/api/.env');
  return env.DATABASE_URL;
}

/**
 * Gives the demo account a complimentary Business plan for 30 days, as the operator's
 * «Подарувати тариф» would (`GrantsService.grant`): the offer's limits as a snapshot. Done in SQL
 * because the local operator accounts are personal; this touches only the new demo account, which
 * stands in as its own granting operator (`grantedByUserId` has no foreign key).
 */
export function grantBusinessPlan(email: string): void {
  if (!/^[a-z0-9@.-]+$/.test(email)) throw new Error('unexpected e-mail format');
  const sql = `INSERT INTO "Subscription" ("userId","source","status","offerId","activeCollections","storageBytes","collectionStorageBytes","guestLinks","features","currentPeriodStart","currentPeriodEnd","grantReason","grantedByUserId","updatedAt")
SELECT u.id,'COMPLIMENTARY','ACTIVE',o.id,o."activeCollections",o."storageBytes",o."collectionStorageBytes",o."guestLinks",o.features,now(),now() + interval '30 days','landing media demo account',u.id,now()
FROM "User" u, "BillingOffer" o WHERE u.email = '${email}' AND o.code = 'sub-business';`;
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'execute', '--stdin'], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: databaseUrl() },
    input: sql,
    stdio: ['pipe', 'ignore', 'pipe'],
  });
}

const origin = (page: Page) => ({ origin: new URL(page.url()).origin });

const MIME: Record<string, string> = { jpg: 'image/jpeg', mp4: 'video/mp4' };

/** Uploads a local file as the guest of `page`, the way the browser transport does. */
export async function uploadFile(
  page: Page,
  collectionId: string,
  path: string,
  filename: string,
): Promise<{ id: string; frameNo: number }> {
  const bytes = readFileSync(path);
  const base = `/api/v1/guest/collections/${collectionId}/uploads`;
  const init = await page.request.post(base, {
    data: {
      clientUploadId: randomUUID(),
      filename,
      mimeType: MIME[filename.split('.').pop() ?? ''] ?? '',
      sizeBytes: bytes.length,
    },
    headers: origin(page),
  });
  expect(init.status(), await init.text()).toBe(201);
  const session = (await init.json()) as {
    uploadId: string;
    partSizeBytes: number;
    partCount: number;
  };
  const parts = await page.request.post(`${base}/${session.uploadId}/parts`, {
    data: { partNumbers: Array.from({ length: session.partCount }, (_, i) => i + 1) },
    headers: origin(page),
  });
  expect(parts.status()).toBe(200);
  for (const part of ((await parts.json()) as { parts: { partNumber: number; url: string }[] })
    .parts) {
    const start = (part.partNumber - 1) * session.partSizeBytes;
    const res = await page.request.put(part.url, {
      data: bytes.subarray(start, start + session.partSizeBytes),
    });
    expect(res.status()).toBe(200);
  }
  const done = await page.request.post(`${base}/${session.uploadId}/complete`, {
    headers: origin(page),
  });
  expect(done.status(), await done.text()).toBe(200);
  return (await done.json()) as { id: string; frameNo: number };
}

/** A short Ken Burns clip from three photos (a real video frame for the gallery), made once. */
export function makeDemoVideo(target: string, photos: string[]): void {
  // One still frame per photo, 2 s each (60 frames at 30 fps), slowly zooming in.
  const inputs = photos.flatMap((photo) => ['-i', `${PHOTOS_DIR}${photo}`]);
  const zoom = photos
    .map(
      (_, i) =>
        `[${i}:v]scale=1920:-2,zoompan=z='min(zoom+0.0015,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=60:s=1280x720:fps=30,setsar=1[v${i}]`,
    )
    .join(';');
  const concat = `${photos.map((_, i) => `[v${i}]`).join('')}concat=n=${photos.length}:v=1:a=0[out]`;
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    ...inputs,
    '-filter_complex',
    `${zoom};${concat}`,
    '-map',
    '[out]',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '24',
    '-movflags',
    '+faststart',
    target,
  ]);
}

export const SHARED_PERMISSIONS = {
  canUploadPhotos: true,
  canUploadVideos: true,
  canUploadDocuments: true,
  canSubmitText: true,
  canViewGallery: true,
  canDeleteOwn: true,
};

/** Every guest-link permission on and the shared gallery: guests see each other's frames. */
export async function shareGallery(admin: Page, collectionId: string): Promise<void> {
  const main = (await guestLinks(admin, collectionId)).find((link) => link.isDefault)!;
  const res = await admin.request.patch(`/api/v1/guest-links/${main.id}`, {
    data: { permissions: SHARED_PERMISSIONS },
    headers: origin(admin),
  });
  expect(res.status()).toBe(200);
}

/** Publishes a template with its defaults, a cover copied from a frame and a welcome message. */
export async function publishLook(
  admin: Page,
  collectionId: string,
  templateId: TemplateId,
  coverFrameId: string,
  welcome: string,
): Promise<void> {
  await setDraftCoverFromFrameViaApi(admin, collectionId, coverFrameId);
  await saveGuestPageDraftViaApi(admin, collectionId, {
    templateId,
    settings: { ...definitionOf(templateId)!.defaults },
    welcomeMessage: welcome,
  });
  await publishGuestPageViaApi(admin, collectionId);
  await waitForImageReady(admin, collectionId, 'published', 60_000);
}

export type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

/** A seeded collection; `guest` is its first guest's browser state (their session cookie). */
export type Seeded = { id: string; path: string; frames: number; guest: StorageState };

/** What a run leaves for the next one (`LANDING_MEDIA_STEPS` without `seed`). */
export type DemoState = {
  email: string;
  storage: StorageState;
  collections: Record<TemplateId, Seeded>;
};

/** A guest's browser: its own context and session cookie, joined through the link. */
export async function guestJoin(
  browser: Browser,
  path: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ locale: 'uk-UA' });
  const page = await context.newPage();
  // The page exchanges the link token for the session cookie after it renders.
  const session = page.waitForResponse(
    (res) =>
      /\/guest\/collections\/[^/]+\/session$/.test(res.url()) && res.request().method() === 'POST',
    { timeout: 60_000 },
  );
  await page.goto(path);
  await page.locator('[data-template]').first().waitFor({ timeout: 60_000 });
  expect((await session).status()).toBe(200);
  return { context, page };
}

/** Creates one collection with its guests' frames, then its published look. */
export async function seedCollection(
  browser: Browser,
  admin: Page,
  demo: DemoCollection,
): Promise<Seeded> {
  const { id } = await createCollectionViaApi(admin, demo.title, demo.description);
  await shareGallery(admin, id);
  const path = await mainLinkPath(admin, id);
  let frames = 0;
  let coverFrameId: string | null = null;
  let firstGuest: StorageState | null = null;
  for (const guest of demo.guests) {
    const { context, page } = await guestJoin(browser, path);
    const named = await page.request.patch(`/api/v1/guest/collections/${id}/session`, {
      data: { name: guest.name },
      headers: origin(page),
    });
    expect(named.status(), await named.text()).toBe(200);
    for (const photo of guest.photos) {
      const frame = await uploadFile(
        page,
        id,
        `${PHOTOS_DIR}${photo}`,
        photo.replace(/^[a-z]+-/, 'IMG_'),
      );
      if (photo === demo.cover && coverFrameId === null) coverFrameId = frame.id;
      frames += 1;
    }
    for (const video of guest.videos ?? []) {
      await uploadFile(page, id, `${SCRATCH}${video}`, 'VID_0412.mp4');
      frames += 1;
    }
    for (const wish of guest.wishes) {
      await submitTextViaApi(page, id, wish);
      frames += 1;
    }
    firstGuest ??= await context.storageState();
    await context.close();
  }
  await waitForContentProcessed(admin, id, frames, 180_000);
  await publishLook(admin, id, demo.key, coverFrameId!, demo.welcome);
  return { id, path, frames, guest: firstGuest! };
}

/** A fresh demo admin (registered and confirmed through Mailpit) with a Business grant. */
export async function demoAdmin(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page; email: string }> {
  // Shown in the app's top bar: a person's address, unique per run.
  const email = `olia.${Date.now().toString(36)}@stepler.test`;
  const context = await browser.newContext({
    locale: 'de-DE',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await signIn(page, email);
  grantBusinessPlan(email);
  return { context, page, email };
}
