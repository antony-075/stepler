import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const templatesDir = new URL('./templates/', import.meta.url);
const folders = readdirSync(templatesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

/**
 * The selector lists of every style rule in `css`, including rules nested in at-rules
 * (`@media`, `@supports`, `@layer`); declarations and at-rule preludes are skipped. Enough for
 * hand-written template sheets: no strings containing braces.
 */
function ruleSelectors(css: string): string[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors: string[] = [];
  let buffer = '';
  for (const char of source) {
    if (char === '{') {
      const prelude = buffer.trim();
      if (prelude !== '' && !prelude.startsWith('@')) selectors.push(prelude);
      buffer = '';
    } else if (char === '}' || char === ';') {
      buffer = '';
    } else {
      buffer += char;
    }
  }
  return selectors;
}

describe('ruleSelectors', () => {
  test('finds nested rules and skips at-rules and declarations', () => {
    const css = `/* x { } */ [data-template='a'] .b { color: red; }
      @media (min-width: 40rem) { [data-template='a'] .c, [data-template='a'] .d { gap: 0; } }
      @keyframes spin { from { rotate: 0; } to { rotate: 1turn; } }`;
    expect(ruleSelectors(css)).toEqual([
      "[data-template='a'] .b",
      "[data-template='a'] .c, [data-template='a'] .d",
      'from',
      'to',
    ]);
  });
});

describe.each(folders)('templates/%s/styles.css', (folder) => {
  test('every selector is scoped to its template', () => {
    const css = readFileSync(new URL(`${folder}/styles.css`, templatesDir), 'utf8');
    const scope = new RegExp(`^\\[data-template=(['"])${folder}\\1\\]`);
    const keyframeSteps = /^(from|to|\d+(\.\d+)?%)(\s*,\s*(from|to|\d+(\.\d+)?%))*$/;
    for (const list of ruleSelectors(css)) {
      if (keyframeSteps.test(list)) continue;
      for (const selector of list.split(',')) expect(selector.trim()).toMatch(scope);
    }
  });

  test('is imported by src/styles.css', () => {
    expect(readFileSync(new URL('./styles.css', import.meta.url), 'utf8')).toContain(
      `./templates/${folder}/styles.css`,
    );
  });
});
