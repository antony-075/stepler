import { expect, type Page, test } from '@playwright/test';

type Sample = { overflow: number; drawing: boolean };
type OverflowProbe = { samples: Sample[]; done: boolean };

// The landing's contact sheet has one frame circled in wax pencil on load (DESIGN-SYSTEM.md §6.9,
// §8). The loop must stay inside the sheet, so a phone page never scrolls sideways, and under
// reduced motion it is drawn at once. «Як це працює» reveals once on scroll; under reduced
// motion it never hides.
// Ukrainian (no supported browser language), whatever the project's device locale.
test.use({ viewport: { width: 360, height: 780 }, locale: 'de-DE' });

const loop = (page: Page) => page.locator('[data-pencil-mark="loop"]');
const sheet = (page: Page) => page.locator('section:has([data-pencil-mark="loop"])');

const dashOffset = (page: Page) =>
  loop(page).evaluate((path) => parseFloat(getComputedStyle(path).strokeDashoffset));

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('with motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  for (const width of [320, 360, 393]) {
    test(`/ at ${width}px keeps the sheet and its pencil loop inside the viewport`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 780 });
      await page.goto('/');
      await expect(sheet(page)).toBeVisible();
      await expect(loop(page)).toBeVisible();
      const layout = await sheet(page).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const mark = element.querySelector('[data-pencil-mark]')!.closest('svg')!;
        const markRect = mark.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          clientWidth: document.documentElement.clientWidth,
          markInside:
            markRect.left >= rect.left &&
            markRect.right <= rect.right &&
            markRect.top >= rect.top &&
            markRect.bottom <= rect.bottom,
        };
      });
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.right).toBeLessThanOrEqual(layout.clientWidth);
      expect(layout.markInside).toBe(true);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      // The sign-in form is reachable in the first screen.
      const field = await page.getByLabel('Електронна пошта').boundingBox();
      expect(field!.y + field!.height).toBeLessThanOrEqual(780);
      // Scrolled to the end (the reveal has run), still no sideways scroll.
      await page.locator('footer').scrollIntoViewIfNeeded();
      await expect(page.locator('[data-reveal="shown"]')).toBeAttached();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }

  test('/login draws the pencil loop once and never scrolls sideways', async ({ page }) => {
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
    await expect(loop(page)).toBeAttached();
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
    const iterations = await loop(page).evaluate(
      (path) => getComputedStyle(path).animationIterationCount,
    );
    expect(iterations).toBe('1');
  });

  test('«Як це працює» reveals once when it scrolls into view', async ({ page }) => {
    await page.goto('/');
    const how = page.locator('[data-slot="reveal"]');
    await expect(how).toHaveAttribute('data-reveal', 'armed');
    await how.scrollIntoViewIfNeeded();
    await expect(how).toHaveAttribute('data-reveal', 'shown');
    const underline = page.locator('[data-pencil-mark="underline"]');
    await expect
      .poll(() => underline.evaluate((path) => parseFloat(getComputedStyle(path).strokeDashoffset)))
      .toBe(0);
    // Scrolling away and back does not replay it.
    await page.evaluate(() => window.scrollTo(0, 0));
    await how.scrollIntoViewIfNeeded();
    await expect(how).toHaveAttribute('data-reveal', 'shown');
  });
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('/login shows the pencil loop already drawn, without animation', async ({ page }) => {
    await page.goto('/login');
    await expect(loop(page)).toBeAttached();
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );
    const state = await loop(page).evaluate((path) => ({
      animation: getComputedStyle(path).animationName,
      running: path.getAnimations().length,
      offset: parseFloat(getComputedStyle(path).strokeDashoffset),
    }));
    expect(state).toEqual({ animation: 'none', running: 0, offset: 0 });
  });

  test('«Як це працює» is never hidden and never animates', async ({ page }) => {
    await page.goto('/');
    const how = page.locator('[data-slot="reveal"]');
    await how.scrollIntoViewIfNeeded();
    await expect(page.getByRole('heading', { name: 'Гості додають кадри' })).toBeVisible();
    expect(await how.getAttribute('data-reveal')).toBeNull();
    const state = await how.evaluate((element) => ({
      opacity: getComputedStyle(element.querySelector('ol')!).opacity,
      running: element.getAnimations({ subtree: true }).length,
    }));
    expect(state).toEqual({ opacity: '1', running: 0 });
  });
});
