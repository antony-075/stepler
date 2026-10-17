import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Browser } from '@playwright/test';

/** The film: 1920×1080, 30 fps, Stepler's calm grey with ink and one blue. */
export const CANVAS = { width: 1920, height: 1080 };
const BACKGROUND = '#F4F4F5';
const INK = '#171A21';
const BLUE = '#3657FF';
/** A cut between two scenes; longer when the device changes (a slide, not a dissolve). */
const FADE = 0.35;
const SLIDE = 0.55;
/** The longest film, in seconds. */
const MAX_LENGTH = 45;

export type Device = 'desktop' | 'phone';

/** Where a recorded screen sits on the canvas (CSS px of the canvas). */
export const PLACEMENT: Record<
  Device,
  { x: number; y: number; width: number; height: number; radius: number }
> = {
  // 1440×900 at 0.8667, under a 36px title bar.
  desktop: { x: 336, y: 196, width: 1248, height: 780, radius: 14 },
  // 390×844 at 1.0256, inside a 14px bezel.
  phone: { x: 760, y: 168, width: 400, height: 866, radius: 44 },
};

const font = (file: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../packages/ui/src/fonts/${file}`, import.meta.url)),
  ).toString('base64');
const logo = () =>
  readFileSync(
    fileURLToPath(new URL('../../apps/web/public/brand/logo-light.svg', import.meta.url)),
    'utf8',
  );

/** The frame around a screen: everything but a transparent hole where the recording plays. */
function frameHtml(
  device: Device,
  label: string,
  step: number,
  steps: number,
  layer: 'chrome' | 'words',
): string {
  const p = PLACEMENT[device];
  const hole = (x: number, y: number, w: number, h: number, r: number) =>
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  // Desktop: the hole's top corners are square (the title bar sits on them).
  const desktopHole = `M${p.x} ${p.y}H${p.x + p.width}V${p.y + p.height - p.radius}A${p.radius} ${p.radius} 0 0 1 ${p.x + p.width - p.radius} ${p.y + p.height}H${p.x + p.radius}A${p.radius} ${p.radius} 0 0 1 ${p.x} ${p.y + p.height - p.radius}Z`;
  const holePath = device === 'desktop' ? desktopHole : hole(p.x, p.y, p.width, p.height, p.radius);
  const chrome =
    device === 'desktop'
      ? `<div class="window" style="left:${p.x}px;top:${p.y - 36}px;width:${p.width}px;height:${p.height + 36}px">
           <div class="bar"><i></i><i></i><i></i></div></div>`
      : // A ring: a transparent box with a 14px ink border (inner radius 58 − 14 = the screen's 44).
        `<div class="phone" style="left:${p.x - 14}px;top:${p.y - 14}px;width:${p.width}px;height:${p.height}px"></div>`;
  return `<!doctype html><html><head><style>
    @font-face { font-family: Golos; src: url(data:font/woff2;base64,${font('golos-text-wght.woff2')}) format('woff2'); font-weight: 400 900; }
    html, body { margin: 0; width: ${CANVAS.width}px; height: ${CANVAS.height}px; background: transparent; }
    .paper { position: absolute; inset: 0; background: ${BACKGROUND}; clip-path: path(evenodd, 'M0 0H${CANVAS.width}V${CANVAS.height}H0Z ${holePath}'); }
    .window { position: absolute; border-radius: 14px; box-shadow: 0 30px 60px -24px rgb(23 26 33 / 0.28), 0 0 0 1px rgb(23 26 33 / 0.08); }
    .bar { height: 36px; border-radius: 14px 14px 0 0; background: #FFFFFF; border-bottom: 1px solid #E4E4E7; display: flex; gap: 8px; align-items: center; padding-left: 16px; box-sizing: border-box; }
    .bar i { width: 12px; height: 12px; border-radius: 50%; background: #D4D4D8; }
    .phone { position: absolute; border-radius: 58px; border: 14px solid ${INK}; background: transparent; box-shadow: 0 34px 70px -26px rgb(23 26 33 / 0.45); }
    .label { position: absolute; left: 50%; transform: translateX(-50%); top: ${device === 'desktop' ? 58 : 50}px; white-space: nowrap; padding: 12px 30px 14px; border-radius: 999px; background: rgb(255 255 255 / 0.92); box-shadow: 0 10px 30px -12px rgb(23 26 33 / 0.35), 0 0 0 1px rgb(23 26 33 / 0.06); font: 650 42px/1.15 Golos, sans-serif; color: ${INK}; letter-spacing: -0.015em; }
    .step { position: absolute; left: 0; right: 0; top: ${device === 'desktop' ? 30 : 22}px; display: flex; justify-content: center; gap: 8px; }
    .step i { width: 28px; height: 4px; border-radius: 2px; background: #D4D4D8; }
    .step i.on { background: ${BLUE}; }
    .logo { position: absolute; right: 48px; bottom: 34px; height: 30px; }
    .logo svg { height: 30px; width: auto; }
  </style></head><body>
    ${
      layer === 'chrome'
        ? `<div class="paper"></div>${chrome}`
        : `
    <div class="step">${Array.from({ length: steps }, (_, i) => `<i class="${i < step ? 'on' : ''}"></i>`).join('')}</div>
    <div class="label">${label}</div>
    <div class="logo">${logo()}</div>`
    }
  </body></html>`;
}

/** Renders a scene's frame (1920×1080 PNG, transparent where the recording plays). */
export async function renderFrame(
  browser: Browser,
  device: Device,
  label: string,
  step: number,
  steps: number,
  target: string,
): Promise<{ chrome: string; words: string }> {
  const page = await browser.newPage({ viewport: CANVAS, deviceScaleFactor: 1 });
  const out = {
    chrome: target.replace('.png', '-chrome.png'),
    words: target.replace('.png', '-words.png'),
  };
  for (const layer of ['chrome', 'words'] as const) {
    await page.setContent(frameHtml(device, label, step, steps, layer));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out[layer], omitBackground: true });
  }
  await page.close();
  return out;
}

/**
 * A slow push-in during a scene: from 1 to `to`, centred on `focus` (canvas px), between the
 * scene's `from` and `until` (shares of its length), eased in and out.
 */
export type Zoom = { to: number; focus: { x: number; y: number }; from: number; until: number };

export type Scene = {
  clip: string;
  device: Device;
  label: string;
  frame: { chrome: string; words: string };
  duration: number;
  zoom?: Zoom;
};

/** Where a point of the recording (its own CSS px) lands on the canvas. */
export function onCanvas(
  device: Device,
  x: number,
  y: number,
  screen: { width: number },
): {
  x: number;
  y: number;
} {
  const p = PLACEMENT[device];
  const k = p.width / screen.width;
  return { x: p.x + x * k, y: p.y + y * k };
}

/**
 * One scene: the paper, the recording in its place (sped up by `speed`) and the window or phone
 * around it, slowly pushed in when the scene has a `zoom` (rendered at 2× first, so the moving
 * crop never steps a whole pixel), then the caption, the steps and the logo on top, still.
 */
function composeScene(scene: Scene, speed: number, target: string): void {
  const length = scene.duration / speed;
  const p = PLACEMENT[scene.device];
  const W = CANVAS.width;
  const H = CANVAS.height;
  const zoom = scene.zoom ?? { to: 1.035, focus: { x: W / 2, y: H / 2 + 60 }, from: 0, until: 1 };
  const frames = Math.round(length * 30);
  const a = Math.round(zoom.from * frames);
  const b = Math.max(a + 1, Math.round(zoom.until * frames));
  const ease = `(st(0,clip((on-${a})/${b - a},0,1));ld(0)*ld(0)*(3-2*ld(0)))`;
  const z = `1+${(zoom.to - 1).toFixed(4)}*${ease}`;
  const fx = (zoom.focus.x * 2).toFixed(1);
  const fy = (zoom.focus.y * 2).toFixed(1);
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=${BACKGROUND}:s=${W}x${H}:r=30:d=${length.toFixed(3)}`,
    '-i',
    scene.clip,
    '-loop',
    '1',
    '-framerate',
    '30',
    '-i',
    scene.frame.chrome,
    '-loop',
    '1',
    '-framerate',
    '30',
    '-i',
    scene.frame.words,
    '-filter_complex',
    `[1:v]scale=${p.width}:${p.height}:flags=lanczos,setpts=(PTS-STARTPTS)/${speed.toFixed(4)}[screen];` +
      `[0:v][screen]overlay=${p.x}:${p.y}:eof_action=repeat[a];[a][2:v]overlay=0:0:shortest=1,` +
      `scale=${W * 2}:${H * 2}:flags=lanczos,` +
      `zoompan=z='${z}':x='max(0,min(iw-iw/zoom,${fx}-iw/zoom/2))':y='max(0,min(ih-ih/zoom,${fy}-ih/zoom/2))':d=1:s=${W}x${H}:fps=30[z];` +
      `[z][3:v]overlay=0:0:shortest=1,format=yuv420p[out]`,
    '-map',
    '[out]',
    '-t',
    length.toFixed(3),
    '-r',
    '30',
    '-c:v',
    'libx264',
    '-crf',
    '12',
    '-preset',
    'fast',
    target,
  ]);
}

/** The scenes joined with short cross-fades; returns each scene's start and end in the film. */
export function composeFilm(
  scenes: Scene[],
  work: string,
  outputs: { mp4: string; webm: string; vtt: string },
): { start: number; end: number }[] {
  // The film stays within MAX_LENGTH: a longer recording plays a little faster, all of it alike.
  const cut = (i: number) => (scenes[i]!.device === scenes[i - 1]!.device ? FADE : SLIDE);
  const recorded =
    scenes.reduce((sum, scene) => sum + scene.duration, 0) -
    scenes.slice(1).reduce((sum, _, n) => sum + cut(n + 1), 0);
  const speed = Math.max(1, recorded / MAX_LENGTH);
  const parts = scenes.map((scene, i) => {
    const target = `${work}/scene-${i}.mp4`;
    composeScene(scene, speed, target);
    return target;
  });
  let offset = 0;
  const filters: string[] = [];
  let last = '[0:v]';
  const cues: { start: number; end: number }[] = [];
  scenes.forEach((scene, i) => {
    const start = i === 0 ? 0 : offset;
    if (i > 0) {
      const kind =
        cut(i) === FADE ? 'fade' : scene.device === 'phone' ? 'smoothleft' : 'smoothright';
      filters.push(
        `${last}[${i}:v]xfade=transition=${kind}:duration=${cut(i)}:offset=${offset.toFixed(3)}[x${i}]`,
      );
      last = `[x${i}]`;
    }
    offset = start + scene.duration / speed - (i + 1 < scenes.length ? cut(i + 1) : 0);
    cues.push({ start, end: start + scene.duration / speed });
  });
  const joined = `${work}/joined.mp4`;
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    ...parts.flatMap((part) => ['-i', part]),
    '-filter_complex',
    filters.length > 0
      ? `${filters.join(';')};${last}format=yuv420p[out]`
      : '[0:v]format=yuv420p[out]',
    '-map',
    '[out]',
    '-c:v',
    'libx264',
    '-crf',
    '10',
    '-preset',
    'fast',
    joined,
  ]);
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-i',
    joined,
    '-an',
    '-c:v',
    'libx264',
    '-crf',
    '26',
    '-preset',
    'slow',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputs.mp4,
  ]);
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-i',
    joined,
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '0',
    '-crf',
    '38',
    '-row-mt',
    '1',
    '-deadline',
    'good',
    '-cpu-used',
    '2',
    outputs.webm,
  ]);
  const stamp = (t: number) => {
    const ms = Math.round(t * 1000);
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
  };
  const vtt = ['WEBVTT', ''];
  scenes.forEach((scene, i) => {
    const cue = cues[i]!;
    // A cue ends where the next scene's fade starts, so two never overlap.
    const end = i < scenes.length - 1 ? cues[i + 1]!.start : cue.end;
    vtt.push(String(i + 1), `${stamp(cue.start)} --> ${stamp(end)}`, scene.label, '');
  });
  writeFileSync(outputs.vtt, vtt.join('\n'));
  return cues;
}

/** A still of the film at `seconds` (the poster). */
export function grabFrame(video: string, seconds: number, target: string): void {
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-ss',
    seconds.toFixed(2),
    '-i',
    video,
    '-frames:v',
    '1',
    target,
  ]);
}

/** The film's length in seconds (ffprobe). */
export function duration(video: string): number {
  return Number(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      video,
    ])
      .toString()
      .trim(),
  );
}
