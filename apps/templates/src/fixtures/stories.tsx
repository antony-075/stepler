// The shared story shape for every template (plan Task 3): one story per fixture and viewport,
// each checked by the same play function and by axe (`a11y: { test: 'error' }`).
import type { StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { GuestTemplateRoot } from '../react/root.tsx';
import { FIXTURES, type FixtureName, onFiles, onText } from './models.tsx';

export const VIEWPORTS = ['phone360', 'phone390', 'tablet768', 'desktop1440'] as const;
type Viewport = (typeof VIEWPORTS)[number];

type TemplateStoryArgs = { templateId: string; fixture: FixtureName };

/** Renders one template with one fixture, as the guest page does (system fonts: no classes). */
export function TemplateStory({ templateId, fixture }: TemplateStoryArgs) {
  const { model, actions, slots } = FIXTURES[fixture];
  const def = { templateId, templateVersion: 1 };
  return (
    <GuestTemplateRoot
      {...def}
      settings={undefined}
      fontClassName={() => ''}
      model={model}
      actions={actions}
      slots={slots}
    />
  );
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
): StoryObj<typeof TemplateStory> {
  return {
    args: { templateId, fixture },
    globals: { viewport: { value: viewport } },
    play: async ({ canvasElement, userEvent }) => {
      const { actions } = FIXTURES[fixture];
      await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
      await expect(canvasElement.querySelector('footer')).not.toBeNull();
      await expect(canvasElement.querySelector('h1')).not.toBeNull();
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
