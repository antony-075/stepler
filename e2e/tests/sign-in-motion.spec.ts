import { expect, type Page, test } from '@playwright/test';

type Sample = { overflow: number; drawing: boolean };
type OverflowProbe = { samples: Sample[]; done: boolean };

// The sign-in page's one handwritten note under the guest's phone has the page's one pencil arrow,
// drawn once on load (DESIGN-SYSTEM.md §8; owner review 2026-10-03: one arrow, not three). The
// tilted phone and the note must stay inside the page, so a phone never scrolls sideways, and
// under reduced motion the arrow is simply there.
// Ukrainian (no supported browser language), whatever the project's device locale.
test.use({ viewport: { width: 360, height: 780 }, locale: 'de-DE' });

const arrows = (page: Page) => page.locator('[data-pencil-mark="arrow"]');

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('with motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  for (const width of [320, 360, 393]) {
    test(`/login at ${width}px keeps the steps and the phone inside the viewport`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 780 });
      await page.goto('/login');
      await expect(arrows(page)).toHaveCount(1);
      // The sign-in form is reachable in the first screen.
      const field = await page.getByLabel('Електронна пошта').boundingBox();
      expect(field!.y + field!.height).toBeLessThanOrEqual(780);

      const how = page.locator('section[aria-labelledby="how-title"]');
      await how.scrollIntoViewIfNeeded();
      await expect(how.getByText('Покажіть гостям QR-код')).toBeVisible();
      const phone = page.locator('figure');
      await phone.scrollIntoViewIfNeeded();
      await expect(phone.getByText('Так це бачать гості')).toBeVisible();
      const outside = await phone.evaluate((figure) => {
        const width = document.documentElement.clientWidth;
        return [...figure.querySelectorAll('svg, img, figcaption')]
          .map((element) => element.getBoundingClientRect())
          .filter((rect) => rect.left < 0 || rect.right > width).length;
      });
      expect(outside).toBe(0);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.locator('footer').scrollIntoViewIfNeeded();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }

  test('/login draws the arrow once and never scrolls sideways', async ({ page }) => {
    // Desktop width: the phone is in the first screen there.
    await page.setViewportSize({ width: 1440, height: 900 });
    // Samples on every animation frame and on a 25ms timer (WebKit throttles rAF under load, so
    // frames alone can miss most of the draw) from the start of the document until the draw (it
    // starts at 500ms and runs 480ms) has run and ended, or 5s have passed.
    await page.addInitScript(() => {
      const probe: OverflowProbe = { samples: [], done: false };
      (window as unknown as { __overflow: OverflowProbe }).__overflow = probe;
      const start = performance.now();
      const sample = () => {
        if (probe.done) return;
        const root = document.documentElement;
        const entry: Sample = {
          overflow: root.scrollWidth - root.clientWidth,
          drawing: document
            .getAnimations()
            .some(
              (a) =>
                a instanceof CSSAnimation &&
                a.animationName === 'pencil-draw' &&
                a.playState === 'running',
            ),
        };
        probe.samples.push(entry);
        const drawn = !entry.drawing && probe.samples.some((s) => s.drawing);
        if (drawn || performance.now() - start >= 5000) {
          probe.done = true;
          clearInterval(timer);
        }
      };
      const onFrame = () => {
        sample();
        if (!probe.done) requestAnimationFrame(onFrame);
      };
      const timer = setInterval(sample, 25);
      requestAnimationFrame(onFrame);
    });
    await page.goto('/login');
    await expect(arrows(page)).toHaveCount(1);
    const handle = await page.waitForFunction(() => {
      const probe = (window as unknown as { __overflow: OverflowProbe }).__overflow;
      return probe.done ? probe.samples : null;
    });
    const samples = (await handle.jsonValue()) ?? [];
    // The window must cover the draws, or the test proves nothing: at least one sample saw a draw
    // running, and sampling went on until none was (the probe stops only then, or at 5s).
    expect(samples.some((s) => s.drawing)).toBe(true);
    expect(samples.at(-1)?.drawing).toBe(false);
    expect(samples.filter((s) => s.overflow > 0)).toEqual([]);
    // It runs once and ends drawn.
    await expect
      .poll(() =>
        arrows(page).evaluateAll((paths) =>
          paths.map((path) => parseFloat(getComputedStyle(path).strokeDashoffset)),
        ),
      )
      .toEqual([0]);
    const iterations = await arrows(page).evaluateAll((paths) =>
      paths.map((path) => getComputedStyle(path).animationIterationCount),
    );
    expect(iterations).toEqual(['1']);
  });
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('/login shows the arrow already drawn, without animation', async ({ page }) => {
    await page.goto('/login');
    await expect(arrows(page)).toHaveCount(1);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );
    const states = await arrows(page).evaluateAll((paths) =>
      paths.map((path) => ({
        animation: getComputedStyle(path).animationName,
        running: path.getAnimations().length,
        offset: parseFloat(getComputedStyle(path).strokeDashoffset),
      })),
    );
    expect(states).toEqual([{ animation: 'none', running: 0, offset: 0 }]);
  });
});
