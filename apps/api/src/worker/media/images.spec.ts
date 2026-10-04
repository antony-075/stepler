import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import { decodeHeic } from './decode.js';
import { MAX_DECODED_PIXELS, MAX_INPUT_PIXELS, renderDerivatives } from './images.js';
import { PermanentMediaError } from './media-error.js';
import { withWorkDir } from './work-dir.js';

const fixture = (name: string): Buffer =>
  readFileSync(new URL(`../../../test/fixtures/media/${name}`, import.meta.url));

/**
 * 400×200 stored pixels, left half red and right half blue, tagged EXIF orientation 6 ("rotate
 * 90° clockwise to display") with a camera and GPS-like IFD: displayed upright it is 200×400
 * with red on top.
 */
async function orientedJpeg(): Promise<Buffer> {
  const half = { width: 200, height: 200, channels: 3 as const };
  const red = await sharp({ create: { ...half, background: '#ff0000' } })
    .png()
    .toBuffer();
  const blue = await sharp({ create: { ...half, background: '#0000ff' } })
    .png()
    .toBuffer();
  return sharp({ create: { width: 400, height: 200, channels: 3, background: '#000' } })
    .composite([
      { input: red, left: 0, top: 0 },
      { input: blue, left: 200, top: 0 },
    ])
    .jpeg()
    .withExif({ IFD0: { Make: 'Stepler Test Camera', Copyright: 'olena@example.com' } })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

/** A PNG header that claims `width`×`height` (a decompression bomb needs no real pixels). */
function pngClaiming(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.alloc(1 + width * 3))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const pixel = async (image: Buffer, left: number, top: number) => {
  const { data } = await sharp(image)
    .extract({ left, top, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return [...data.subarray(0, 3)];
};

describe('renderDerivatives', () => {
  test('a JPEG with EXIF orientation 6 comes out upright and without EXIF', async () => {
    const input = await orientedJpeg();
    expect((await sharp(input).metadata()).orientation).toBe(6);

    const result = await renderDerivatives(input, { autoOrient: true });

    expect(result.source).toEqual({ width: 200, height: 400 });
    expect([result.large.width, result.large.height]).toEqual([200, 400]);
    const meta = await sharp(result.large.data).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    // Red (the stored left half) is now on top.
    const [r, , b] = await pixel(result.large.data, 100, 50);
    expect(r).toBeGreaterThan(200);
    expect(b).toBeLessThan(60);
    expect((await sharp(result.thumbnail.data).metadata()).exif).toBeUndefined();
  });

  test('without autoOrient the pixels are taken as they are (decoded HEIC, video frames)', async () => {
    const result = await renderDerivatives(await orientedJpeg(), { autoOrient: false });
    expect(result.source).toEqual({ width: 400, height: 200 });
    expect([result.large.width, result.large.height]).toEqual([400, 200]);
  });

  test('fits the thumbnail in 480 px and the preview in 1600 px, never enlarging', async () => {
    const big = await sharp({
      create: { width: 3200, height: 2400, channels: 3, background: '#808080' },
    })
      .jpeg()
      .toBuffer();
    const result = await renderDerivatives(big, { autoOrient: true });
    expect([result.thumbnail.width, result.thumbnail.height]).toEqual([480, 360]);
    expect([result.large.width, result.large.height]).toEqual([1600, 1200]);

    const small = await renderDerivatives(fixture('photo.png'), { autoOrient: true });
    expect([small.large.width, small.large.height]).toEqual([320, 240]);
  });

  test('refuses an input over the pixel limit before decoding it', async () => {
    const bomb = pngClaiming(20_000, 20_000);
    expect(20_000 * 20_000).toBeGreaterThan(MAX_INPUT_PIXELS);
    await expect(renderDerivatives(bomb, { autoOrient: true })).rejects.toThrow(
      PermanentMediaError,
    );
    await expect(renderDerivatives(bomb, { autoOrient: true })).rejects.toThrow(/pixel limit/);
  });

  test('a PNG (decoded whole) stops at 40 MP, below the JPEG limit', async () => {
    const png = pngClaiming(7000, 7000);
    expect(7000 * 7000).toBeGreaterThan(MAX_DECODED_PIXELS);
    expect(7000 * 7000).toBeLessThan(MAX_INPUT_PIXELS);
    await expect(renderDerivatives(png, { autoOrient: true })).rejects.toThrow(/pixel limit/);
  });

  test('a file that is not an image is a permanent failure', async () => {
    await expect(renderDerivatives(fixture('doc.pdf'), { autoOrient: true })).rejects.toThrow(
      PermanentMediaError,
    );
  });

  test('takes the first frame of an animated GIF', async () => {
    const result = await renderDerivatives(fixture('anim.gif'), { autoOrient: true });
    expect([result.large.width, result.large.height]).toEqual([160, 120]);
  });
});

describe('decodeHeic', () => {
  test('decodes the HEIC fixture to an upright JPEG that sharp reads', async () => {
    await withWorkDir(async (dir) => {
      const input = join(dir, 'original');
      await writeFile(input, fixture('photo.heic'));
      const decoded = await decodeHeic(input, dir);
      const result = await renderDerivatives(decoded, { autoOrient: false });
      expect(result.source).toEqual({ width: 320, height: 240 });
      expect((await sharp(result.large.data).metadata()).exif).toBeUndefined();
    });
  });

  test('a file that is not HEIC is a permanent failure', async () => {
    await withWorkDir(async (dir) => {
      const input = join(dir, 'original');
      await writeFile(input, fixture('photo.jpg'));
      await expect(decodeHeic(input, dir)).rejects.toThrow(PermanentMediaError);
    });
  });
});
