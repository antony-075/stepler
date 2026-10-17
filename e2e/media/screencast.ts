import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';

/**
 * Records a page through the DevTools screencast: a JPEG for every painted frame with its time,
 * sharper than Playwright's `recordVideo` (a fixed low VP8 bitrate). `stop()` turns the frames
 * into a constant 30 fps clip.
 */
export async function startScreencast(
  page: Page,
  dir: string,
  size: { width: number; height: number },
): Promise<{ stop: (clip: string) => Promise<number> }> {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames: { file: string; at: number }[] = [];
  cdp.on('Page.screencastFrame', (event) => {
    const file = `${dir}/${String(frames.length).padStart(5, '0')}.jpg`;
    writeFileSync(file, Buffer.from(event.data, 'base64'));
    frames.push({ file, at: event.metadata.timestamp ?? Date.now() / 1000 });
    void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: size.width,
    maxHeight: size.height,
    everyNthFrame: 1,
  });
  const started = Date.now() / 1000;
  return {
    async stop(clip: string) {
      // One more frame of the final state, then stop.
      await page.waitForTimeout(400);
      await cdp.send('Page.stopScreencast');
      const ended = Date.now() / 1000;
      await cdp.detach().catch(() => undefined);
      if (frames.length === 0) throw new Error('the screencast sent no frames');
      const first = Math.max(frames[0]!.at, started);
      const lines = ['ffconcat version 1.0'];
      frames.forEach((frame, i) => {
        const next = frames[i + 1]?.at ?? ended;
        lines.push(
          `file '${frame.file}'`,
          `duration ${Math.max(next - Math.max(frame.at, first), 0.001).toFixed(4)}`,
        );
      });
      lines.push(`file '${frames.at(-1)!.file}'`);
      writeFileSync(`${dir}/list.ffconcat`, `${lines.join('\n')}\n`);
      execFileSync('ffmpeg', [
        '-loglevel',
        'error',
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        `${dir}/list.ffconcat`,
        '-vf',
        `scale=${size.width}:${size.height}:flags=lanczos,fps=30,format=yuv420p`,
        '-c:v',
        'libx264',
        '-crf',
        '14',
        '-preset',
        'fast',
        clip,
      ]);
      return ended - first;
    },
  };
}

/**
 * A visible pointer for the recording (headless pages draw none). On desktops a 30px arrow that
 * follows the mouse, with a soft blue ripple where it presses; on phones a translucent finger
 * dot that shows while a tap is held and a ripple as it lands. Added by an init script, so every
 * navigation keeps it.
 */
export async function showPointer(page: Page, kind: 'mouse' | 'touch'): Promise<void> {
  await page.context().addInitScript((mode: string) => {
    const install = () => {
      if (document.getElementById('__media-pointer')) return;
      const layer = document.createElement('div');
      layer.id = '__media-pointer';
      layer.setAttribute('aria-hidden', 'true');
      const base = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;';
      layer.style.cssText = `${base}width:0;height:0;`;
      const ripple = (x: number, y: number, size: number, colour: string) => {
        const ring = document.createElement('div');
        ring.style.cssText = `${base}width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;border-radius:50%;border:2px solid ${colour};background:${colour.replace('0.7', '0.18')};transform:translate(${x}px, ${y}px) scale(0.35);opacity:1;transition:transform 520ms cubic-bezier(.2,.7,.3,1), opacity 520ms ease-out;`;
        layer.append(ring);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            ring.style.transform = `translate(${x}px, ${y}px) scale(1)`;
            ring.style.opacity = '0';
          }),
        );
        setTimeout(() => ring.remove(), 600);
      };
      if (mode === 'mouse') {
        const arrow = document.createElement('div');
        arrow.style.cssText = `${base}width:30px;height:38px;opacity:0;transition:opacity 150ms;will-change:transform;filter:drop-shadow(0 3px 5px rgb(0 0 0 / 0.28));`;
        arrow.innerHTML =
          '<svg width="30" height="38" viewBox="0 0 22 28"><path d="M2 2 L2 22 L7.5 17 L11 25.5 L14.6 24 L11.2 15.8 L18.5 15.8 Z" fill="#171A21" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
        layer.append(arrow);
        addEventListener(
          'mousemove',
          (event) => {
            arrow.style.opacity = '1';
            arrow.style.transform = `translate(${event.clientX - 3}px, ${event.clientY - 3}px)`;
          },
          true,
        );
        addEventListener(
          'mousedown',
          (event) => {
            arrow.style.transform += ' scale(0.88)';
            ripple(event.clientX, event.clientY, 64, 'rgb(54 87 255 / 0.7)');
          },
          true,
        );
        addEventListener(
          'mouseup',
          (event) => {
            arrow.style.transform = `translate(${event.clientX - 3}px, ${event.clientY - 3}px)`;
          },
          true,
        );
      } else {
        const finger = document.createElement('div');
        finger.style.cssText = `${base}width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgb(23 26 33 / 0.28);border:2px solid rgb(255 255 255 / 0.9);box-shadow:0 4px 12px rgb(0 0 0 / 0.25);opacity:0;transition:opacity 140ms;`;
        layer.append(finger);
        const down = (x: number, y: number) => {
          finger.style.transform = `translate(${x}px, ${y}px)`;
          finger.style.opacity = '1';
          ripple(x, y, 90, 'rgb(54 87 255 / 0.7)');
        };
        const up = () => setTimeout(() => (finger.style.opacity = '0'), 160);
        addEventListener(
          'touchstart',
          (e) => down(e.touches[0]!.clientX, e.touches[0]!.clientY),
          true,
        );
        addEventListener('touchend', up, true);
        addEventListener('mousedown', (e) => down(e.clientX, e.clientY), true);
        addEventListener('mouseup', up, true);
      }
      document.documentElement.append(layer);
    };
    if (document.documentElement) install();
    document.addEventListener('DOMContentLoaded', install, { once: true });
  }, kind);
}

/** Where each page's filmed mouse is, so the next move starts there. */
const position = new WeakMap<Page, { x: number; y: number }>();

/** Moves the filmed mouse to (x, y) along an eased path at a person's speed (one step a frame). */
export async function glide(page: Page, x: number, y: number, ms?: number): Promise<void> {
  const from = position.get(page) ?? { x: x - 260, y: y + 180 };
  const distance = Math.hypot(x - from.x, y - from.y);
  const time = ms ?? Math.min(1100, Math.max(420, distance * 1.1));
  const steps = Math.max(8, Math.round(time / 16));
  // A gentle bow, as a hand moves: the path bends a little off the straight line.
  const bend = Math.min(60, distance * 0.12);
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    const arc = Math.sin(Math.PI * e) * bend;
    await page.mouse.move(from.x + (x - from.x) * e + arc * 0.3, from.y + (y - from.y) * e - arc);
    await page.waitForTimeout(16);
  }
  position.set(page, { x, y });
}

/** A person's pace: the pointer glides to the element, rests, then presses and releases. */
export async function humanClick(page: Page, target: Locator, pause = 450): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (box === null) throw new Error('target not visible');
  await glide(page, box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(pause);
  await page.mouse.down();
  await page.waitForTimeout(110);
  await page.mouse.up();
}

/** A tap on a phone, at the same pace: a beat before, the finger shown while it presses. */
export async function humanTap(page: Page, target: Locator, pause = 500): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(pause);
  await target.tap();
}

/** Typing at a person's pace: a little uneven, a short rest after a space. */
export async function humanType(page: Page, target: Locator, text: string): Promise<void> {
  for (const char of text) {
    await target.pressSequentially(char);
    await page.waitForTimeout(char === ' ' ? 110 : 45 + Math.round(Math.random() * 45));
  }
}
