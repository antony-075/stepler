import { expect, type Page, test } from '@playwright/test';

type Sample = { overflow: number; drawing: boolean };
type OverflowProbe = { samples: Sample[]; done: boolean };

// «Як це працює» on the landing joins its three handwritten labels to the product fragments with
// pencil arrows, drawn once on load one after another (DESIGN-SYSTEM.md §8). The composition
// (a tilted phone included) must stay inside the page, so a phone never scrolls sideways, and
// under reduced motion the arrows are simply there.
// Ukrainian (no supported browser language), whatever the project's device locale.
test.use({ viewport: { width: 360, height: 780 }, locale: 'de-DE' });

const arrows = (page: Page) => page.locator('[data-pencil-mark="arrow"]');

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('with motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  for (const width of [320, 360, 393]) {
    test(`/ at ${width}px keeps «Як це працює» inside the viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await page.goto('/');
      await expect(arrows(page)).toHaveCount(3);
      // The sign-in form is reachable in the first screen.
      const field = await page.getByLabel('Електронна пошта').boundingBox();
      expect(field!.y + field!.height).toBeLessThanOrEqual(780);

      const how = page.locator('section[aria-labelledby="how-title"]');
      await how.scrollIntoViewIfNeeded();
      await expect(how.getByText('Поділіться QR-кодом з гостями')).toBeVisible();
      const outside = await how.evaluate((section) => {
        const width = document.documentElement.clientWidth;
        return [...section.querySelectorAll('svg, img, [role="img"]')]
          .map((element) => element.getBoundingClientRect())
          .filter((rect) => rect.left < 0 || rect.right > width).length;
      });
      expect(outside).toBe(0);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.locator('footer').scrollIntoViewIfNeeded();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }

  test('/login draws the arrows once and never scrolls sideways', async ({ page }) => {
    // Desktop width: the composition is in the first screen there.
    await page.setViewportSize({ width: 1440, height: 900 });
    // Samples every animation frame from the first one the document gets until the draws (the
    // last starts at 940ms and runs 480ms) have run and ended, or 5s have passed.
    await page.addInitScript(() => {
      const probe: OverflowProbe = { samples: [], done: false };
      (window as unknown as { __overflow: OverflowProbe }).__overflow = probe;
      const start = performance.now();
      const sample = () => {
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
        if (!drawn && performance.now() - start < 5000) requestAnimationFrame(sample);
        else probe.done = true;
      };
      requestAnimationFrame(sample);
    });
    await page.goto('/login');
    await expect(arrows(page)).toHaveCount(3);
    const handle = await page.waitForFunction(() => {
      const probe = (window as unknown as { __overflow: OverflowProbe }).__overflow;
      return probe.done ? probe.samples : null;
    });
    const samples = (await handle.jsonValue()) ?? [];
    // The window must cover the draws, or the test proves nothing.
    expect(samples.filter((s) => s.drawing).length).toBeGreaterThanOrEqual(5);
    expect(samples.filter((s) => s.overflow > 0)).toEqual([]);
    // Each runs once and ends drawn.
    await expect
      .poll(() =>
        arrows(page).evaluateAll((paths) =>
          paths.map((path) => parseFloat(getComputedStyle(path).strokeDashoffset)),
        ),
      )
      .toEqual([0, 0, 0]);
    const iterations = await arrows(page).evaluateAll((paths) =>
      paths.map((path) => getComputedStyle(path).animationIterationCount),
    );
    expect(iterations).toEqual(['1', '1', '1']);
  });
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('/login shows the arrows already drawn, without animation', async ({ page }) => {
    await page.goto('/login');
    await expect(arrows(page)).toHaveCount(3);
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
    expect(states).toEqual(Array(3).fill({ animation: 'none', running: 0, offset: 0 }));
  });
});
