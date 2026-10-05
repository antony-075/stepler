import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import { decodeHeic } from './decode.js';
import { run } from './exec.js';
import { exiftoolLocationTags, ffprobeLocationKeys, stripLocation } from './location.js';
import { PermanentMediaError } from './media-error.js';
import { withWorkDir } from './work-dir.js';

// Fixtures with GPS: test/fixtures/media/generate-location.sh. These tests run the real tools
// (exiftool, ffmpeg/ffprobe, libheif), like the worker image does.

const fixturePath = (name: string): string =>
  new URL(`../../../test/fixtures/media/${name}`, import.meta.url).pathname;

/** The fixture copied into `dir` as `original` (the worker downloads to that name). */
async function original(dir: string, name: string): Promise<string> {
  const path = join(dir, 'original');
  await copyFile(fixturePath(name), path);
  return path;
}

/** Tags exiftool reads (`group:name` → value), for what must stay. */
async function tags(path: string, ...names: string[]): Promise<Record<string, unknown>> {
  const out = await run('exiftool', ['-j', '-G1', ...names.map((n) => `-${n}`), path], {
    timeoutMs: 30_000,
  });
  const [first] = JSON.parse(out.toString('utf8')) as Record<string, unknown>[];
  return first ?? {};
}

/** Container tags ffprobe sees. */
async function formatTags(path: string): Promise<Record<string, string>> {
  const out = await run(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format_tags', '-of', 'json', path],
    { timeoutMs: 30_000 },
  );
  return (
    (JSON.parse(out.toString('utf8')) as { format: { tags?: Record<string, string> } }).format
      .tags ?? {}
  );
}

/** An MD5 of every stream's packets, copied without decoding: equal means bit-identical. */
const streamsMd5 = async (path: string): Promise<string> =>
  (
    await run('ffmpeg', ['-v', 'error', '-i', path, '-map', '0', '-c', 'copy', '-f', 'md5', '-'], {
      timeoutMs: 30_000,
    })
  ).toString('utf8');

const pixels = async (path: string): Promise<Buffer> => sharp(path).raw().toBuffer();

describe('stripLocation', () => {
  test('a JPEG loses EXIF and XMP GPS and place names, and keeps date, orientation, camera, ICC and pixels', () =>
    withWorkDir(async (dir) => {
      const input = await original(dir, 'location.jpg');
      expect(Object.keys(await exiftoolLocationTags(input))).toEqual(
        expect.arrayContaining(['GPS:GPSLatitude', 'XMP-exif:GPSLatitude', 'XMP-photoshop:City']),
      );

      const result = await stripLocation(input, 'image/jpeg', dir);

      if (!result.changed) throw new Error('expected a rewrite');
      expect(await exiftoolLocationTags(result.path)).toEqual({});
      const kept = ['DateTimeOriginal', 'Orientation', 'Make', 'Model', 'ProfileDescription'];
      expect(await tags(result.path, ...kept)).toEqual({
        ...(await tags(input, ...kept)),
        SourceFile: result.path,
      });
      expect(await tags(result.path, 'Orientation#')).toMatchObject({ 'IFD0:Orientation': 6 });
      expect(await pixels(result.path)).toEqual(await pixels(input));
      // The download itself is never changed: a retry starts from the same bytes.
      expect(await readFile(input)).toEqual(await readFile(fixturePath('location.jpg')));
    }));

  test('a HEIC loses its EXIF GPS and keeps its date, camera and image', () =>
    withWorkDir(async (dir) => {
      const input = await original(dir, 'location.heic');
      const result = await stripLocation(input, 'image/heic', dir);

      if (!result.changed) throw new Error('expected a rewrite');
      expect(await exiftoolLocationTags(result.path)).toEqual({});
      expect(await tags(result.path, 'DateTimeOriginal', 'Make')).toMatchObject({
        'ExifIFD:DateTimeOriginal': '2026:06:14 15:30:00',
        'IFD0:Make': 'Stepler Test Camera',
      });
      const before = await withWorkDir((d) => decodeHeic(input, d).then(pixels));
      const after = await withWorkDir((d) => decodeHeic(result.path, d).then(pixels));
      expect(after).toEqual(before);
    }));

  test.each([
    ['location.mp4', 'video/mp4'],
    ['location.mov', 'video/quicktime'],
  ])(
    '%s loses ©xyz, the Apple ISO 6709 key and loci; streams and creation time stay',
    (name, mime) =>
      withWorkDir(async (dir) => {
        const input = await original(dir, name);
        expect((await ffprobeLocationKeys(input)).format.length).toBeGreaterThan(0);

        const result = await stripLocation(input, mime, dir);

        if (!result.changed) throw new Error('expected a rewrite');
        expect(await exiftoolLocationTags(result.path)).toEqual({});
        expect(await ffprobeLocationKeys(result.path)).toEqual({ format: [], streams: [] });
        expect((await formatTags(result.path)).creation_time).toMatch(/^2026-06-14T15:30:00/);
        expect(await streamsMd5(result.path)).toBe(await streamsMd5(input));
      }),
  );

  test('a WebM is remuxed without its LOCATION tag; streams and other tags stay', () =>
    withWorkDir(async (dir) => {
      const input = await original(dir, 'location.webm');
      expect((await ffprobeLocationKeys(input)).format).toEqual(['LOCATION']);

      const result = await stripLocation(input, 'video/webm', dir);

      if (!result.changed) throw new Error('expected a rewrite');
      expect(await ffprobeLocationKeys(result.path)).toEqual({ format: [], streams: [] });
      expect((await formatTags(result.path)).DATE_RECORDED).toBe('2026-06-14');
      expect(await streamsMd5(result.path)).toBe(await streamsMd5(input));
    }));

  test.each([
    ['photo.jpg', 'image/jpeg'],
    ['photo.png', 'image/png'],
    ['photo.webp', 'image/webp'],
    ['anim.gif', 'image/gif'],
    ['photo.heic', 'image/heic'],
    ['clip.mp4', 'video/mp4'],
    ['clip.mov', 'video/quicktime'],
    ['clip.webm', 'video/webm'],
  ])('%s without location is left as it is', (name, mime) =>
    withWorkDir(async (dir) => {
      expect(await stripLocation(await original(dir, name), mime, dir)).toEqual({
        changed: false,
      });
    }),
  );

  test('a type it does not know is a permanent failure', () =>
    withWorkDir(async (dir) => {
      await expect(
        stripLocation(await original(dir, 'doc.pdf'), 'application/pdf', dir),
      ).rejects.toThrow(PermanentMediaError);
    }));
});
