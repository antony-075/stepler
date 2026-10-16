// The shared story shape for every template (plan Task 3): one story per fixture and viewport,
// each checked by the same play function and by axe (`a11y: { test: 'error' }`).
import type { StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { Align, CoverPlacement, Corners, ThemeSettings } from '@stepler/contracts';
import { definitionOf } from '../core/registry.ts';
import { GuestTemplateRoot } from '../react/root.tsx';
import { type Fixture, FIXTURES, type FixtureName, onFiles, onText } from './models.tsx';

export const VIEWPORTS = ['phone360', 'phone390', 'tablet768', 'desktop1440'] as const;
type Viewport = (typeof VIEWPORTS)[number];

type TemplateStoryArgs = {
  templateId: string;
  fixture: FixtureName;
  /** Another cover placement than the template's default (where it allows it). */
  coverPlacement?: CoverPlacement;
  /** Another alignment or corners than the template's defaults (owner remark 111). */
  align?: Align;
  corners?: Corners;
};

/** Renders one template with one fixture, as the guest page does (system fonts: no classes). */
export function TemplateStory({
  templateId,
  fixture,
  coverPlacement,
  align,
  corners,
}: TemplateStoryArgs) {
  const { model, actions, slots } = FIXTURES[fixture];
  const def = { templateId, templateVersion: 1 };
  const settings = settingsFor(templateId, FIXTURES[fixture], coverPlacement);
  return (
    <GuestTemplateRoot
      {...def}
      settings={
        settings === undefined
          ? undefined
          : {
              ...settings,
              ...(align === undefined ? {} : { align }),
              ...(corners === undefined ? {} : { corners }),
            }
      }
      fontClassName={() => ''}
      model={model}
      actions={actions}
      slots={slots}
    />
  );
}

/** The template's defaults, or with an image background at 45% for that fixture. */
function settingsFor(
  templateId: string,
  fixture: Fixture,
  coverPlacement: CoverPlacement | undefined,
): ThemeSettings | undefined {
  const def = definitionOf(templateId);
  if (def === undefined) return undefined;
  const settings = {
    ...def.defaults,
    ...(coverPlacement === undefined ? {} : { coverPlacement }),
  };
  if (fixture.imageBackground !== true || !def.options.backgroundKinds.includes('image')) {
    return settings;
  }
  const { min, max } = def.options.imageDim;
  return { ...settings, background: { kind: 'image', dim: Math.min(max, Math.max(min, 45)) } };
}

/** Elements that take space on screen (the actions exist twice: the dock and the sheet). */
function visible(elements: Iterable<Element>): HTMLElement[] {
  return [...elements].filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement && element.checkVisibility(),
  );
}

/**
 * A story for `fixture` at `viewport` with the plan's checks: no sideways scroll, the terms
 * notice after the primary action, a footer, a primary action at least 44px tall that calls
 * its handler once per click.
 */
export function storyAt(
  templateId: string,
  fixture: FixtureName,
  viewport: Viewport,
  coverPlacement?: CoverPlacement,
): StoryObj<typeof TemplateStory> {
  return {
    args: { templateId, fixture, ...(coverPlacement === undefined ? {} : { coverPlacement }) },
    globals: { viewport: { value: viewport } },
    play: async ({ canvasElement, userEvent }) => {
      const { actions, model } = FIXTURES[fixture];
      await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
      await expect(canvasElement.querySelector('footer')).not.toBeNull();
      await expect(canvasElement.querySelector('h1')).not.toBeNull();
      // The wordmark in the header at every width (owner remark 110).
      await expect(visible(canvasElement.querySelectorAll('a[href="#home"]'))).toHaveLength(1);
      // Phones and tablets show one view at a time (owner remarks 2026-10-16); from 1024px both,
      // without the tabs. A region may be a `display: contents` wrapper: its children show.
      const shows = (region: Element | null) =>
        region !== null && (region.checkVisibility() || visible(region.children).length > 0);
      const intro = canvasElement.querySelector('[data-region="intro"]');
      const frames = canvasElement.querySelector('[data-region="frames"]');
      await expect(frames).not.toBeNull();
      const desktop = window.innerWidth >= 1024;
      // Without tabs (a view-only link) the page shows everything it has at every width.
      const oneView = !desktop && FIXTURES[fixture].slots.tabs !== null;
      await expect(visible(canvasElement.querySelectorAll('[role="tablist"]'))).toHaveLength(
        desktop || FIXTURES[fixture].slots.tabs === null ? 0 : 1,
      );
      if (!oneView) {
        await expect(shows(frames)).toBe(true);
        if (intro !== null) await expect(shows(intro)).toBe(true);
      } else if (model.view === 'frames') {
        await expect(shows(frames)).toBe(true);
        if (intro !== null) await expect(shows(intro)).toBe(false);
        return;
      } else {
        await expect(shows(intro)).toBe(true);
        await expect(shows(frames)).toBe(false);
      }
      // The welcome wherever the title is (owner remark 109).
      if (model.welcomeMessage !== null) {
        const welcome = visible(canvasElement.querySelectorAll('[data-slot="guest-welcome"]'));
        await expect(welcome).toHaveLength(1);
        await expect(welcome[0]).toHaveTextContent(model.welcomeMessage);
      }
      if (actions === null) {
        await expect(canvasElement.querySelector('[data-slot="guest-legal-notice"]')).toBeNull();
        return;
      }
      const label = actions.primary.label;
      const [primary] = visible(canvasElement.querySelectorAll('button')).filter(
        (button) => button.textContent?.trim() === label,
      );
      await expect(primary).toBeDefined();
      await expect(primary!.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      // The notice that closes the same actions block comes after the primary action.
      const notices = visible(canvasElement.querySelectorAll('[data-slot="guest-legal-notice"]'));
      const after = notices.filter(
        (notice) =>
          primary!.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING &&
          primary!.parentElement?.contains(notice),
      );
      await expect(after).toHaveLength(1);
      const spy = actions.primary.icon === 'files' ? onFiles : onText;
      spy.mockClear();
      await userEvent.click(primary!);
      await expect(spy).toHaveBeenCalledTimes(1);
    },
  };
}

const ALIGNS: readonly Align[] = ['start', 'center'];
const CORNERS: readonly Corners[] = ['sharp', 'soft', 'round'];

/** Every alignment × corners pair of one template, stacked, at phone width (owner remark 111). */
export function TemplateMatrix({ templateId }: { templateId: string }) {
  return (
    <div style={{ display: 'grid', gap: 32 }}>
      {ALIGNS.flatMap((align) =>
        CORNERS.map((corners) => (
          <section key={`${align}-${corners}`} aria-label={`${align} · ${corners}`}>
            <TemplateStory
              templateId={templateId}
              fixture="FirstVisit"
              align={align}
              corners={corners}
            />
          </section>
        )),
      )}
    </div>
  );
}

/** The matrix story: each pair renders, fits the width, and applies the alignment it was given. */
export function matrixStory(templateId: string): StoryObj<typeof TemplateStory> {
  return {
    args: { templateId, fixture: 'FirstVisit' },
    globals: { viewport: { value: 'phone390' } },
    // Six whole pages in one story repeat their landmarks and ids by construction; each page is
    // checked by axe in the template's single-page stories.
    parameters: { a11y: { test: 'off' } },
    render: () => <TemplateMatrix templateId={templateId} />,
    play: async ({ canvasElement }) => {
      await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
      const roots = canvasElement.querySelectorAll<HTMLElement>('[data-template]');
      await expect(roots).toHaveLength(6);
      for (const [i, root] of [...roots].entries()) {
        const align = ALIGNS[Math.floor(i / CORNERS.length)]!;
        await expect(root.style.getPropertyValue('--tpl-align')).toBe(align);
        const title = visible(root.querySelectorAll('h1'))[0]!;
        await expect(getComputedStyle(title).textAlign).toBe(align);
      }
    },
  };
}
