import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';
import {
  COLLECTIONS,
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
 * `LANDING_MEDIA_STEPS` (default all, in this order): `seed` a demo account and six collections;
 * `admin` the desktop stills; `guest` the guest page stills; `upload` the upload still (its
 * photos join the wedding, so it comes after the others); `video` the walkthrough.
 * `LANDING_MEDIA_LOCALES` (default `uk,en`). Without `seed`, the last run's demo data (in the
 * scratch folder) is reused.
 */
const STEPS = new Set(
  (process.env.LANDING_MEDIA_STEPS ?? 'seed,admin,guest,upload,video').split(','),
);
const locales = (process.env.LANDING_MEDIA_LOCALES?.split(',') ?? LOCALES) as Locale[];
const STATE = `${SCRATCH}demo-state.json`;
const WEDDING = COLLECTIONS.find((demo) => demo.key === 'postcard')!;

test('landing media', async ({ browser, baseURL }) => {
  mkdirSync(SCRATCH, { recursive: true });
  let state: DemoState;
  if (STEPS.has('seed') || !existsSync(STATE)) {
    makeDemoVideo(`${SCRATCH}wedding-evening.mp4`, [
      'wedding-bench.jpg',
      'wedding-sunset.jpg',
      'wedding-table.jpg',
    ]);
    const admin = await demoAdmin(browser);
    const collections = {} as Record<TemplateId, Seeded>;
    for (const demo of COLLECTIONS) {
      collections[demo.key] = await seedCollection(browser, admin.page, demo);
    }
    state = { email: admin.email, storage: await admin.context.storageState(), collections };
    writeFileSync(STATE, JSON.stringify(state, null, 2));
    await admin.context.close();
  } else {
    state = JSON.parse(readFileSync(STATE, 'utf8')) as DemoState;
  }
  console.log(`demo account: ${state.email}`);
  const wedding = state.collections.postcard;

  for (const locale of locales) {
    if (STEPS.has('admin')) {
      await adminStills(browser, baseURL!, locale, state.storage, wedding, WEDDING.title);
      await writeManifest('screens');
    }
    if (STEPS.has('guest')) {
      for (const demo of COLLECTIONS) {
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
      await guestUploadStill(browser, baseURL!, locale, wedding);
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
