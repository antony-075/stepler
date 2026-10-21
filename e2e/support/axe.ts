import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import type { AxeResults, Result } from 'axe-core';

const AXE_SOURCE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

/** WCAG 2.2 A and AA, the level the product aims for (rule 05). */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
/**
 * Device chrome in the landing's phone pictures: the status bar's «9:41», hidden from assistive
 * technology and tinted to the screenshot under it (white on the dimmed upload sheet is 4.3:1).
 * Incidental text in a picture, which WCAG 1.4.3 exempts.
 */
const DECORATIVE = ['[data-slot="device-status-bar"]'];

export interface Violation {
  id: string;
  impact: Result['impact'];
  help: string;
  targets: string[];
}

/**
 * Runs axe-core in the page as it is now and returns the violations, each with the selectors of
 * its nodes (so a failure names what to fix). Animations should have settled: a fade-in caught
 * half-way reads as low contrast. `within` limits the check to one element, such as an open modal
 * dialog: the page behind it is inert and dimmed on purpose.
 */
export async function axeViolations(page: Page, within?: string): Promise<Violation[]> {
  await page.addScriptTag({ path: AXE_SOURCE });
  const results = await page.evaluate(
    ([tags, selector, decorative]) =>
      (window as unknown as { axe: { run: (...args: unknown[]) => Promise<AxeResults> } }).axe.run(
        { include: selector === null ? [] : [selector], exclude: decorative },
        { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] },
      ),
    [TAGS, within ?? null, DECORATIVE] as const,
  );
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }));
}
