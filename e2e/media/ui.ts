import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, BrowserContext, Page } from '@playwright/test';

export type Locale = 'uk' | 'en';
export const LOCALES: Locale[] = ['uk', 'en'];

type Messages = Record<string, unknown>;
const messages = (locale: Locale): Messages =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../apps/web/messages/${locale}.json`, import.meta.url)),
      'utf8',
    ),
  ) as Messages;

/** A UI string by its message key, so the tool follows the app's copy in both languages. */
export function ui(locale: Locale, key: string): string {
  let node: unknown = messages(locale);
  for (const part of key.split('.')) node = (node as Messages)[part];
  if (typeof node !== 'string') throw new Error(`no message ${key} (${locale})`);
  return node;
}

export const OUT = fileURLToPath(new URL('../../apps/web/public/landing/', import.meta.url));

const require = createRequire(
  fileURLToPath(new URL('../../apps/api/package.json', import.meta.url)),
);
/** The part of sharp (the API's own dependency, no new package for the tool) used here. */
type SharpImage = {
  resize(options: { width: number }): SharpImage;
  webp(options: { quality: number; effort: number; smartSubsample: boolean }): SharpImage;
  toBuffer(options: {
    resolveWithObject: true;
  }): Promise<{ data: Buffer; info: { width: number; height: number } }>;
  metadata(): Promise<{ width: number; height: number }>;
};
const sharp = require('sharp') as (input: Buffer) => SharpImage;

type Size = { width: number; height: number; bytes: number };

/** Writes a WebP (quality 82, smaller widths when asked) and records its size for the manifest. */
export async function writeWebp(
  input: Buffer,
  relative: string,
  options: { width?: number; quality?: number; maxBytes?: number } = {},
): Promise<Size | null> {
  const target = `${OUT}${relative}`;
  mkdirSync(dirname(target), { recursive: true });
  let image = sharp(input);
  if (options.width !== undefined) image = image.resize({ width: options.width });
  const { data, info } = await image
    .webp({ quality: options.quality ?? 82, effort: 6, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });
  if (options.maxBytes !== undefined && data.length > options.maxBytes) return null;
  writeFileSync(target, data);
  const size = { width: info.width, height: info.height, bytes: data.length };
  return size;
}

/**
 * Writes `<dir>/manifest.json`: every WebP under `dir` (both languages, @2x too), keyed by its
 * path from there (`uk/guest-classic.webp`), with its pixel size. Read from the files, so it
 * always matches what is on disk, whatever steps a run took.
 */
export async function writeManifest(dir: string): Promise<void> {
  const root = `${OUT}${dir}/`;
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.webp'))
    .sort();
  const entries: Record<string, { width: number; height: number }> = {};
  for (const file of files) {
    const { width, height } = await sharp(readFileSync(`${root}${file}`)).metadata();
    entries[file] = { width, height };
  }
  writeFileSync(`${root}manifest.json`, `${JSON.stringify(entries, null, 2)}\n`);
}

/** The signed-in account's language (the app follows the profile over the cookie when signed in). */
export async function setProfileLocale(page: Page, baseURL: string, locale: Locale): Promise<void> {
  const res = await page.request.patch('/api/v1/me', {
    data: { locale },
    headers: { origin: new URL(baseURL).origin },
  });
  if (!res.ok()) throw new Error(`PATCH /me failed: ${res.status()}`);
}

/**
 * Hidden in every capture: the Next.js dev tools badge (`nextjs-portal`, only in `next dev`) and
 * passing toasts. Neither is part of the product screen being shown.
 */
const CAPTURE_CSS =
  'nextjs-portal{display:none!important}[data-slot="toast"]{display:none!important}';

/** Adds the capture stylesheet to every page and frame of `context`, before its scripts. */
export async function hideCaptureNoise(context: BrowserContext): Promise<void> {
  await context.addInitScript((css: string) => {
    const add = () => {
      const style = document.createElement('style');
      style.dataset.capture = '';
      style.textContent = css;
      document.documentElement.append(style);
    };
    if (document.documentElement) add();
    else document.addEventListener('DOMContentLoaded', add, { once: true });
  }, CAPTURE_CSS);
}

const cookies = (baseURL: string, locale: Locale) => {
  const url = new URL(baseURL);
  return [
    { name: 'st_locale', value: locale, domain: url.hostname, path: '/' },
    { name: 'st_theme', value: 'light', domain: url.hostname, path: '/' },
  ];
};

export const PHONE = { width: 390, height: 844 };
export const DESKTOP = { width: 1440, height: 900 };

/** A guest's phone: 390×844 at 2×, touch, light, the given language. */
export async function phoneContext(
  browser: Browser,
  baseURL: string,
  locale: Locale,
  storageState?: Awaited<ReturnType<BrowserContext['storageState']>>,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    ...(storageState === undefined ? {} : { storageState }),
    viewport: PHONE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
    locale: locale === 'uk' ? 'uk-UA' : 'en-GB',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  await context.addCookies(cookies(baseURL, locale));
  await hideCaptureNoise(context);
  return context;
}

/** The admin's laptop: 1440×900, the demo account's session, light, the given language. */
export async function desktopContext(
  browser: Browser,
  baseURL: string,
  locale: Locale,
  storageState: Awaited<ReturnType<BrowserContext['storageState']>>,
  deviceScaleFactor = 1,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor,
    colorScheme: 'light',
    locale: locale === 'uk' ? 'uk-UA' : 'en-GB',
    storageState,
  });
  await context.addCookies(cookies(baseURL, locale));
  await hideCaptureNoise(context);
  return context;
}

/**
 * Waits until the screen is still: fonts loaded, every image in view decoded (iframes too), no
 * spinner or skeleton left, then a short pause for transitions to end.
 */
export async function settle(page: Page, extraMs = 700): Promise<void> {
  await page.waitForLoadState('load');
  const frames = page.frames();
  for (const frame of frames) {
    await frame
      .waitForFunction(
        () => {
          if (document.fonts.status !== 'loaded') return false;
          const images = [...document.images].filter((img) => {
            const rect = img.getBoundingClientRect();
            return rect.width > 0 && rect.bottom > 0 && rect.top < innerHeight;
          });
          const busy = document.querySelector(
            '[data-slot="spinner"], [data-slot="skeleton"], .loading-delayed',
          );
          return images.every((img) => img.complete && img.naturalWidth > 0) && busy === null;
        },
        undefined,
        { timeout: 30_000, polling: 250 },
      )
      .catch(() => undefined);
  }
  await page.waitForTimeout(extraMs);
}

/**
 * A collection's «Поділитися» on the dashboard row (at 1440px the collection page has none: its
 * header shows it from 1500px, in the mini-nav).
 */
export const shareButton = (page: Page, locale: Locale, title: string) =>
  page
    .locator('[data-slot="collection-card"]')
    .filter({ has: page.getByRole('link', { name: title, exact: true }) })
    .getByRole('button', { name: ui(locale, 'collections.card.share') });
