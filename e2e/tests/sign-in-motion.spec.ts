import { expect, test } from '@playwright/test';

type Sample = { t: number; overflow: number; styled: boolean; flyIn: boolean };
type OverflowProbe = { samples: Sample[]; done: boolean };

// The sign-in illustration flies its tiles in from outside the stack on first paint. With motion
// on, that entrance must never make a phone page scroll sideways, not even for a frame.
test.use({ viewport: { width: 360, height: 780 }, reducedMotion: 'no-preference' });

test('/login never scrolls sideways while the illustration animates in', async ({ page }) => {
  // Samples every animation frame from the first one the document gets until ~1.5s later.
  await page.addInitScript(() => {
    const probe: OverflowProbe = { samples: [], done: false };
    (window as unknown as { __overflow: OverflowProbe }).__overflow = probe;
    const start = performance.now();
    const sample = () => {
      const root = document.documentElement;
      const stack = document.querySelector('.st-stack');
      probe.samples.push({
        t: Math.round(performance.now()),
        overflow: root.scrollWidth - root.clientWidth,
        styled: stack !== null && getComputedStyle(stack).position === 'relative',
        flyIn: document
          .getAnimations()
          .some((a) => a instanceof CSSAnimation && a.animationName === 'st-fly-in'),
      });
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
  expect(samples.some((s) => s.flyIn)).toBe(true);
  const overflowing = samples.filter((s) => s.overflow > 0);
  expect(overflowing, JSON.stringify(overflowing.slice(0, 5))).toEqual([]);
});
