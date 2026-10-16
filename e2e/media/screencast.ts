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
 * A visible pointer for the recording (headless pages draw none): an arrow that follows the
 * mouse on desktops, a fading touch ring where a phone is tapped. Added by an init script, so
 * every navigation keeps it.
 */
export async function showPointer(page: Page, kind: 'mouse' | 'touch'): Promise<void> {
  await page.context().addInitScript((mode: string) => {
    const install = () => {
      if (document.getElementById('__media-pointer')) return;
      const pointer = document.createElement('div');
      pointer.id = '__media-pointer';
      pointer.setAttribute('aria-hidden', 'true');
      const base = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;';
      if (mode === 'mouse') {
        pointer.style.cssText = `${base}width:22px;height:28px;opacity:0;transition:opacity 120ms;will-change:transform;`;
        pointer.innerHTML =
          '<svg width="22" height="28" viewBox="0 0 22 28"><path d="M2 2 L2 22 L7.5 17 L11 25.5 L14.6 24 L11.2 15.8 L18.5 15.8 Z" fill="#171A21" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
        addEventListener(
          'mousemove',
          (event) => {
            pointer.style.opacity = '1';
            pointer.style.transform = `translate(${event.clientX - 2}px, ${event.clientY - 2}px)`;
          },
          true,
        );
      } else {
        pointer.style.cssText = `${base}width:0;height:0;`;
        addEventListener(
          'pointerdown',
          (event) => {
            const ring = document.createElement('div');
            ring.style.cssText = `${base}width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgb(54 87 255 / 0.28);border:2px solid rgb(54 87 255 / 0.65);transform:translate(${event.clientX}px, ${event.clientY}px) scale(0.6);transition:transform 380ms ease-out, opacity 380ms ease-out;`;
            pointer.append(ring);
            requestAnimationFrame(() => {
              ring.style.transform = `translate(${event.clientX}px, ${event.clientY}px) scale(1.1)`;
              ring.style.opacity = '0';
            });
            setTimeout(() => ring.remove(), 450);
          },
          true,
        );
      }
      document.documentElement.append(pointer);
    };
    if (document.documentElement) install();
    document.addEventListener('DOMContentLoaded', install, { once: true });
  }, kind);
}

/** A person's pace: the pointer travels to the element, rests, then clicks. */
export async function humanClick(page: Page, target: Locator, pause = 250): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (box === null) throw new Error('target not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 });
  await page.waitForTimeout(pause);
  await target.click();
}

/** A tap on a phone, at the same pace. */
export async function humanTap(page: Page, target: Locator, pause = 350): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(pause);
  await target.tap();
}
