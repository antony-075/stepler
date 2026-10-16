import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { type Browser, test } from '@playwright/test';
import {
  collectionsFor,
  type DemoState,
  demoAdmin,
  makeDemoVideo,
  SCRATCH,
  type Seeded,
  seedCollection,
  type TemplateId,
} from './seed.js';
import {
  adminStills,
  guestFramesStill,
  guestPageStill,
  guestUploadStill,
  guestWishStill,
} from './stills.js';
import { type Locale, LOCALES, writeManifest } from './ui.js';
import { recordWalkthrough } from './walkthrough.js';

/**
 * The landing's product media from the running local app (e2e/media/README.md).
 * `LANDING_MEDIA_STEPS` (default all, in this order): `seed` a demo account and six collections
 * per language (Ukrainian and English content alike); `admin` the desktop stills; `guest` the
 * guest page stills; `upload` the upload still (its photos join the wedding, so it comes after
 * the others); `video` the walkthrough. `LANDING_MEDIA_LOCALES` (default `uk,en`). Without
 * `seed`, the last run's demo data (in the scratch folder) is reused.
 *
 * The stills tell one story: «Нова колекція» types the wedding's title, and the share dialog,
 * the guest page, the upload and the content grid are that same wedding.
 */
const STEPS = new Set(
  (process.env.LANDING_MEDIA_STEPS ?? 'seed,admin,guest,upload,video').split(','),
);
const locales = (process.env.LANDING_MEDIA_LOCALES?.split(',') ?? LOCALES) as Locale[];
const statePath = (locale: Locale) => `${SCRATCH}demo-state-${locale}.json`;

/** This language's demo account and collections: seeded now, or the last run's. */
async function demoState(browser: Browser, locale: Locale): Promise<DemoState> {
  const path = statePath(locale);
  if (!STEPS.has('seed') && existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf8')) as DemoState;
  }
  const admin = await demoAdmin(browser);
  const collections = {} as Record<TemplateId, Seeded>;
  for (const demo of collectionsFor(locale)) {
    collections[demo.key] = await seedCollection(browser, admin.page, demo);
  }
  const state = { email: admin.email, storage: await admin.context.storageState(), collections };
  writeFileSync(path, JSON.stringify(state, null, 2));
  await admin.context.close();
  return state;
}

test('landing media', async ({ browser, baseURL }) => {
  mkdirSync(SCRATCH, { recursive: true });
  if (STEPS.has('seed') || !existsSync(`${SCRATCH}wedding-evening.mp4`)) {
    makeDemoVideo(`${SCRATCH}wedding-evening.mp4`, [
      'wedding-bench.jpg',
      'wedding-sunset.jpg',
      'wedding-table.jpg',
    ]);
  }
  const states = {} as Record<Locale, DemoState>;
  for (const locale of locales) {
    states[locale] = await demoState(browser, locale);
    console.log(`demo account (${locale}): ${states[locale].email}`);
  }

  for (const locale of locales) {
    const state = states[locale];
    const demos = collectionsFor(locale);
    const wedding = state.collections.postcard;
    const weddingTitle = demos.find((demo) => demo.key === 'postcard')!.title;
    if (STEPS.has('admin')) {
      await adminStills(browser, baseURL!, locale, state.storage, wedding, weddingTitle);
      await writeManifest('screens');
    }
    if (STEPS.has('guest')) {
      for (const demo of demos) {
        await guestPageStill(browser, baseURL!, locale, demo.key, state.collections[demo.key]);
      }
      await guestFramesStill(browser, baseURL!, locale, wedding);
      await guestWishStill(browser, baseURL!, locale, wedding);
      await writeManifest('screens');
    }
  }
  // These photos really join the wedding, which the screens above show as it was.
  if (STEPS.has('upload')) {
    for (const locale of locales) {
      await guestUploadStill(browser, baseURL!, locale, states[locale].collections.postcard);
      await writeManifest('screens');
    }
  }
  if (STEPS.has('video')) {
    for (const locale of locales) {
      await recordWalkthrough(browser, baseURL!, locale);
      await writeManifest('video');
    }
  }
});
