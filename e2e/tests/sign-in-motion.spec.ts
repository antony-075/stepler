import { expect, test } from '@playwright/test';

type Offender = { element: string; right: number };
type Sample = { t: number; overflow: number; flyInRunning: boolean; widest?: Offender };
type OverflowProbe = { samples: Sample[]; done: boolean };

// The sign-in illustration flies its tiles in from outside the stack on first paint. With motion
// on, that entrance must never make a phone page scroll sideways, not even for a frame.
test.use({ viewport: { width: 360, height: 780 }, reducedMotion: 'no-preference' });

/** The StapledStack root: it must clip horizontally and sit inside the page (below `lg`). */
test('/login clips the sign-in illustration to the viewport', async ({ page }) => {
  await page.goto('/login');
  const root = page.locator('[role="img"]:has(> .st-stack)');
  await expect(root).toBeVisible();
  const layout = await root.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      overflowX: getComputedStyle(element).overflowX,
      left: rect.left,
      right: rect.right,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  expect(layout.overflowX).toBe('clip');
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.clientWidth);
});

test('/login never scrolls sideways while the illustration animates in', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'WebKit leaves in-flight transform animations out of scrollWidth, so sampling cannot see this overflow there; the clip test above covers WebKit',
  );
  // Samples every animation frame from the first one the document gets until ~1.5s later.
  await page.addInitScript(() => {
    const probe: OverflowProbe = { samples: [], done: false };
    (window as unknown as { __overflow: OverflowProbe }).__overflow = probe;
    const start = performance.now();
    const describe = (element: Element): string =>
      `${element.tagName.toLowerCase()}.${Array.from(element.classList).join('.')}`;
    const sample = () => {
      const root = document.documentElement;
      const overflow = root.scrollWidth - root.clientWidth;
      const entry: Sample = {
        t: Math.round(performance.now()),
        overflow,
        // Finished fly-ins stay in getAnimations() (fill: both), so count only running ones.
        flyInRunning: document
          .getAnimations()
          .some(
            (a) =>
              a instanceof CSSAnimation &&
              a.animationName === 'st-fly-in' &&
              a.playState === 'running',
          ),
      };
      if (overflow > 0) {
        let widest: Offender | undefined;
        // HTML elements in the page flow only: the report should name the tile, not a shape
        // inside its SVG or a fixed layer (e.g. the toast viewport) that follows the viewport.
        for (const element of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
          if (!(element instanceof HTMLElement)) continue;
          if (getComputedStyle(element).position === 'fixed') continue;
          const right = element.getBoundingClientRect().right;
          if (!widest || right > widest.right) widest = { element: describe(element), right };
        }
        entry.widest = widest;
      }
      probe.samples.push(entry);
      if (performance.now() - start < 1500) requestAnimationFrame(sample);
      else probe.done = true;
    };
    requestAnimationFrame(sample);
  });
  await page.goto('/login');
  await expect(page.locator('.st-stack')).toBeVisible();
  const handle = await page.waitForFunction(() => {
    const probe = (window as unknown as { __overflow: OverflowProbe }).__overflow;
    return probe.done ? probe.samples : null;
  });
  const samples = (await handle.jsonValue()) ?? [];
  // The window must cover the entrance, or the test proves nothing.
  expect(samples.filter((s) => s.flyInRunning).length).toBeGreaterThanOrEqual(5);
  const overflowing = samples.filter((s) => s.overflow > 0);
  expect(overflowing, JSON.stringify(overflowing.slice(0, 5))).toEqual([]);
});
