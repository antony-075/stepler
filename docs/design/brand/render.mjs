// Stepler brand: rasterizes each option's icons and draws its preview sheet (2026-10-06).
// Run from this folder after generate.py: `node render.mjs`. sharp is the API's dependency.
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../apps/api/package.json', import.meta.url));
const sharp = require('sharp');
const HERE = new URL('.', import.meta.url).pathname;
const OUT = `${HERE}out`;
const OPTIONS = { a: 'A · Pinned photo', b: 'B · Stapler', c: 'C · Pin' };

/** An SVG file as a PNG of `size` px (square), rendered sharp at that size. */
const png = (file, width, height = width) =>
  sharp(readFileSync(file), { density: Math.min(2400, Math.max(72, (width / 64) * 72 * 3)) })
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

const label = (text, colour, size = 15) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${size + 8}"><text x="0" y="${size}" font-family="Helvetica, Arial" font-size="${size}" fill="${colour}">${text}</text></svg>`,
  );

async function sheet(option) {
  const dir = `${OUT}/${option}`;
  for (const [size, name] of [
    [16, 'favicon-16.png'],
    [32, 'favicon-32.png'],
    [48, 'favicon-48.png'],
  ])
    await sharp(await png(`${dir}/favicon.svg`, size)).toFile(`${dir}/${name}`);
  for (const [size, name] of [
    [180, 'apple-touch-icon.png'],
    [192, 'icon-192.png'],
    [512, 'icon-512.png'],
  ])
    await sharp(await png(`${dir}/app-icon.svg`, size)).toFile(`${dir}/${name}`);

  const W = 1500;
  const parts = [];
  const bands = [
    ['#FFFFFF', '#18181B', 'light'],
    ['#111318', '#F4F4F5', 'dark'],
  ];
  let y = 0;
  for (const [bg, fg, theme] of bands) {
    parts.push({ input: { create: { width: W, height: 470, channels: 4, background: bg } }, left: 0, top: y });
    parts.push({ input: label(`${OPTIONS[option]} — ${theme}`, fg, 18), left: 24, top: y + 14 });
    // Sizes 16/24/32/48 at 1x, then the same ×4 (pixels), then 180 and 512 (app icons, scaled).
    let x = 24;
    for (const size of [16, 24, 32, 48]) {
      const mark = await png(`${dir}/mark-${theme}.svg`, size);
      parts.push({ input: mark, left: x, top: y + 60 });
      const big = await sharp(mark).resize(size * 4, size * 4, { kernel: 'nearest' }).png().toBuffer();
      parts.push({ input: big, left: x, top: y + 110 });
      parts.push({ input: label(`${size}px`, fg, 12), left: x, top: y + 120 + size * 4 });
      x += Math.max(size * 4, 60) + 28;
    }
    for (const size of [180, 512]) {
      const icon = await png(`${dir}/${size === 180 ? 'apple-touch-icon.png' : 'icon-512.png'}`.replace('.png', '.png'), size);
      const show = size === 512 ? 200 : 180;
      parts.push({ input: await sharp(icon).resize(show, show).png().toBuffer(), left: x, top: y + 60 });
      parts.push({ input: label(size === 512 ? '512 (shown at 200)' : '180 (apple)', fg, 12), left: x, top: y + 250 });
      x += show + 28;
    }
    // The horizontal logo.
    const logo = await png(`${dir}/logo-${theme}.svg`, 300, 64);
    parts.push({ input: logo, left: x, top: y + 70 });
    // In context: the sidebar's top row at 1x and 2x.
    const sidebarBg = theme === 'light' ? '#F4F4F5' : '#0C0C0E';
    for (const [scale, top] of [
      [1, 300],
      [2, 360],
    ]) {
      const h = 50 * scale;
      const strip = await sharp({ create: { width: 224 * scale, height: h, channels: 4, background: sidebarBg } })
        .composite([{ input: await png(`${dir}/logo-${theme}.svg`, Math.round(110 * scale), 24 * scale), left: 14 * scale, top: 13 * scale }])
        .png()
        .toBuffer();
      parts.push({ input: strip, left: 24 + (scale - 1) * 260, top: y + top });
    }
    parts.push({ input: label('sidebar 1× / 2×', fg, 12), left: 24, top: y + 440 });
    y += 470;
  }
  await sharp({ create: { width: W, height: y, channels: 4, background: '#FFFFFF' } })
    .composite(parts)
    .png()
    .toFile(`${OUT}/preview-${option}.png`);
}

for (const option of Object.keys(OPTIONS)) {
  mkdirSync(`${OUT}/${option}`, { recursive: true });
  await sheet(option);
}
console.log('ok');
