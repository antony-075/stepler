import { expect, type Page, test } from '@playwright/test';

type Sample = { overflow: number; drawing: boolean };
type OverflowProbe = { samples: Sample[]; done: boolean };

// The sign-in illustration is a contact sheet with one frame circled in wax pencil on load
// (DESIGN-SYSTEM.md §6.9, §8). The circle overhangs its frame: it must stay inside the sheet, so
// a phone page never scrolls sideways, and under reduced motion it is drawn at once.
test.use({ viewport: { width: 360, height: 780 } });

const mark = (page: Page) => page.locator('[data-pencil-mark]');
const sheet = (page: Page) => page.locator('[role="img"]:has([data-pencil-mark])');

const dashOffset = (page: Page) =>
  mark(page).evaluate((path) => parseFloat(getComputedStyle(path).strokeDashoffset));

test.describe('with motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('/login keeps the sheet and its pencil mark inside the viewport', async ({ page }) => {
    await page.goto('/login');
    await expect(sheet(page)).toBeVisible();
    const layout = await sheet(page).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const mark = element.querySelector('svg')!.getBoundingClientRect();
      const grid = element.firstElementChild!.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        clientWidth: document.documentElement.clientWidth,
        markInsideGrid:
          mark.left >= grid.left &&
          mark.right <= grid.right &&
          mark.top >= grid.top &&
          mark.bottom <= grid.bottom,
      };
    });
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(layout.clientWidth);
    expect(layout.markInsideGrid).toBe(true);
  });

  test('/login draws the pencil mark once and never scrolls sideways', async ({ page }) => {
    // Samples every animation frame from the first one the document gets until the draw (300ms
    // delay + 400ms) has run and ended, or 5s have passed: a slow first paint must not end the
    // window before the draw starts.
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
    await expect(mark(page)).toBeAttached();
    const handle = await page.waitForFunction(() => {
      const probe = (window as unknown as { __overflow: OverflowProbe }).__overflow;
      return probe.done ? probe.samples : null;
    });
    const samples = (await handle.jsonValue()) ?? [];
    // The window must cover the draw, or the test proves nothing.
    expect(samples.filter((s) => s.drawing).length).toBeGreaterThanOrEqual(5);
    expect(samples.filter((s) => s.overflow > 0)).toEqual([]);
    // It runs once and ends drawn.
    await expect.poll(() => dashOffset(page)).toBe(0);
    const iterations = await mark(page).evaluate(
      (path) => getComputedStyle(path).animationIterationCount,
    );
    expect(iterations).toBe('1');
  });
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('/login shows the pencil mark already drawn, without animation', async ({ page }) => {
    await page.goto('/login');
    await expect(mark(page)).toBeAttached();
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );
    const state = await mark(page).evaluate((path) => ({
      animation: getComputedStyle(path).animationName,
      running: path.getAnimations().length,
      offset: parseFloat(getComputedStyle(path).strokeDashoffset),
    }));
    expect(state).toEqual({ animation: 'none', running: 0, offset: 0 });
  });
});
