import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { FileChooser, Page } from '@playwright/test';
import { humanTap } from './screencast.js';
import type { Locale } from './ui.js';

const require = createRequire(
  fileURLToPath(new URL('../../apps/api/package.json', import.meta.url)),
);
type Sharp = {
  resize(options: { width: number; height: number; fit: 'cover' }): Sharp;
  jpeg(options: { quality: number }): Sharp;
  toBuffer(): Promise<Buffer>;
};
const sharp = require('sharp') as (input: string | Buffer) => Sharp;

const WORDS: Record<Locale, { cancel: string; title: string; add: string; selected: string }> = {
  uk: { cancel: 'Скасувати', title: 'Недавні', add: 'Додати', selected: 'Вибрано' },
  en: { cancel: 'Cancel', title: 'Recents', add: 'Add', selected: 'Selected' },
};

/** A gallery tile: a photo, or a video with its length. */
export type PickerTile = { file: string; video?: { length: string } };

async function thumbnail(tile: PickerTile): Promise<string> {
  let source: string = tile.file;
  if (tile.video !== undefined) {
    source = `${tile.file}.thumb.png`;
    execFileSync('ffmpeg', [
      '-loglevel',
      'error',
      '-y',
      '-ss',
      '1',
      '-i',
      tile.file,
      '-frames:v',
      '1',
      '-vf',
      'scale=600:-2',
      source,
    ]);
  }
  const data = await sharp(source)
    .resize({ width: 300, height: 300, fit: 'cover' })
    .jpeg({ quality: 82 })
    .toBuffer();
  return `data:image/jpeg;base64,${data.toString('base64')}`;
}

/** The gallery's thumbnails, made before the take starts (so the picker opens at once). */
export async function prepareGallery(
  gallery: PickerTile[],
): Promise<{ gallery: PickerTile[]; tiles: { src: string; video: string | null }[] }> {
  const tiles = await Promise.all(
    gallery.map(async (tile) => ({
      src: await thumbnail(tile),
      video: tile.video?.length ?? null,
    })),
  );
  return { gallery, tiles };
}

/**
 * The phone's own photo picker, filmed honestly: the system sheet a browser opens for a file
 * input cannot be recorded, so a system-style gallery sheet (the phone's look, not the app's:
 * the system font, iOS blue, «Скасувати · Недавні · Додати») is drawn over the page. The guest
 * taps the picked tiles (numbered checks, the count in the title), then «Додати»; exactly those
 * files then go to the page's real file input, so the real upload follows.
 */
export async function pickInGallery(
  page: Page,
  chooser: FileChooser,
  locale: Locale,
  prepared: Awaited<ReturnType<typeof prepareGallery>>,
  picked: number[],
): Promise<void> {
  const { gallery, tiles } = prepared;
  await page.evaluate(
    ({ tiles, words }) => {
      const root = document.createElement('div');
      root.id = '__media-picker';
      root.innerHTML = `
        <style>
          #__media-picker { position: fixed; inset: 0; z-index: 2147483646; font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif; }
          #__media-picker .veil { position: absolute; inset: 0; background: rgb(0 0 0 / 0); transition: background 320ms ease; }
          #__media-picker.open .veil { background: rgb(0 0 0 / 0.38); }
          #__media-picker .sheet { position: absolute; left: 0; right: 0; bottom: 0; height: 90%; background: #f2f2f7; border-radius: 14px 14px 0 0; transform: translateY(100%); transition: transform 380ms cubic-bezier(.2,.8,.2,1); display: flex; flex-direction: column; overflow: hidden; }
          #__media-picker.open .sheet { transform: none; }
          #__media-picker .grab { width: 36px; height: 5px; border-radius: 3px; background: #c7c7cc; margin: 6px auto 0; }
          #__media-picker .head { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 10px 16px 12px; font-size: 17px; }
          #__media-picker .head .cancel { color: #007aff; }
          #__media-picker .head .title { font-weight: 600; color: #000; text-align: center; }
          #__media-picker .head .title small { display: block; font-weight: 400; font-size: 12px; color: #8e8e93; }
          #__media-picker .head .add { justify-self: end; color: #c7c7cc; font-weight: 600; transition: color 160ms; }
          #__media-picker .head .add.on { color: #007aff; }
          #__media-picker .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; overflow: hidden; }
          #__media-picker .tile { position: relative; aspect-ratio: 1; background: #ddd center / cover no-repeat; }
          #__media-picker .tile::after { content: ''; position: absolute; inset: 0; background: rgb(255 255 255 / 0); transition: background 160ms; }
          #__media-picker .tile.on::after { background: rgb(255 255 255 / 0.22); }
          #__media-picker .tile .len { position: absolute; right: 5px; bottom: 4px; color: #fff; font-size: 12px; font-weight: 600; text-shadow: 0 1px 2px rgb(0 0 0 / 0.6); z-index: 1; }
          #__media-picker .tile .mark { position: absolute; right: 6px; bottom: 6px; width: 24px; height: 24px; border-radius: 50%; border: 1.5px solid #fff; box-shadow: 0 0 2px rgb(0 0 0 / 0.4); z-index: 2; display: grid; place-items: center; font-size: 13px; font-weight: 700; color: #fff; transform: scale(0.9); transition: background 140ms, transform 200ms cubic-bezier(.3,1.6,.5,1); }
          #__media-picker .tile.video .mark { bottom: 22px; }
          #__media-picker .tile.on .mark { background: #007aff; transform: scale(1.05); }
        </style>
        <div class="veil"></div>
        <div class="sheet">
          <div class="grab"></div>
          <div class="head"><span class="cancel">${words.cancel}</span><span class="title">${words.title}<small></small></span><span class="add">${words.add}</span></div>
          <div class="grid">${tiles
            .map(
              (tile, i) =>
                `<div class="tile${tile.video ? ' video' : ''}" data-pick="${i}" style="background-image:url(${tile.src})">${tile.video ? `<span class="len">${tile.video}</span>` : ''}<span class="mark"></span></div>`,
            )
            .join('')}</div>
        </div>`;
      document.documentElement.append(root);
      let order: number[] = [];
      const render = () => {
        root.querySelectorAll<HTMLElement>('.tile').forEach((tile) => {
          const at = order.indexOf(Number(tile.dataset.pick));
          tile.classList.toggle('on', at >= 0);
          tile.querySelector('.mark')!.textContent = at >= 0 ? String(at + 1) : '';
        });
        root.querySelector('.title small')!.textContent =
          order.length > 0 ? `${words.selected}: ${order.length}` : '';
        root.querySelector('.add')!.classList.toggle('on', order.length > 0);
        root.querySelector('.add')!.textContent =
          order.length > 0 ? `${words.add} (${order.length})` : words.add;
      };
      root.addEventListener('click', (event) => {
        const tile = (event.target as HTMLElement).closest<HTMLElement>('.tile');
        if (tile === null) return;
        const i = Number(tile.dataset.pick);
        order = order.includes(i) ? order.filter((n) => n !== i) : [...order, i];
        render();
      });
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
    },
    { tiles, words: WORDS[locale] },
  );
  await page.waitForTimeout(900);
  for (const i of picked) {
    await humanTap(page, page.locator(`#__media-picker [data-pick="${i}"]`), 380);
  }
  await page.waitForTimeout(500);
  await humanTap(page, page.locator('#__media-picker .add'), 300);
  await page.evaluate(() => document.getElementById('__media-picker')!.classList.remove('open'));
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('__media-picker')!.remove());
  await chooser.setFiles(picked.map((i) => gallery[i]!.file));
}
