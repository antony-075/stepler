import type { Meta } from '@storybook/react-vite';
import { storyAt, TemplateStory } from '../../fixtures/stories.js';

const meta = {
  title: 'Templates/Класика (classic)',
  component: TemplateStory,
  args: { templateId: 'classic', fixture: 'FirstVisit' },
} satisfies Meta<typeof TemplateStory>;

export default meta;

const at = (fixture: Parameters<typeof storyAt>[1], viewport: Parameters<typeof storyAt>[2]) =>
  storyAt('classic', fixture, viewport);

export const FirstVisit360 = at('FirstVisit', 'phone360');
export const FirstVisit390 = at('FirstVisit', 'phone390');
export const FirstVisit768 = at('FirstVisit', 'tablet768');
export const FirstVisit1440 = at('FirstVisit', 'desktop1440');
export const Contributed360 = at('Contributed', 'phone360');
export const Contributed390 = at('Contributed', 'phone390');
export const Contributed768 = at('Contributed', 'tablet768');
export const Contributed1440 = at('Contributed', 'desktop1440');
export const ViewOnly360 = at('ViewOnly', 'phone360');
export const ViewOnly390 = at('ViewOnly', 'phone390');
export const ViewOnly768 = at('ViewOnly', 'tablet768');
export const ViewOnly1440 = at('ViewOnly', 'desktop1440');
export const TextOnly360 = at('TextOnly', 'phone360');
export const TextOnly390 = at('TextOnly', 'phone390');
export const TextOnly768 = at('TextOnly', 'tablet768');
export const TextOnly1440 = at('TextOnly', 'desktop1440');
export const NoCover360 = at('NoCover', 'phone360');
export const NoCover390 = at('NoCover', 'phone390');
export const NoCover768 = at('NoCover', 'tablet768');
export const NoCover1440 = at('NoCover', 'desktop1440');
export const LongTitle360 = at('LongTitle', 'phone360');
export const LongTitle390 = at('LongTitle', 'phone390');
export const LongTitle768 = at('LongTitle', 'tablet768');
export const LongTitle1440 = at('LongTitle', 'desktop1440');
export const LongWelcome360 = at('LongWelcome', 'phone360');
export const LongWelcome390 = at('LongWelcome', 'phone390');
export const LongWelcome768 = at('LongWelcome', 'tablet768');
export const LongWelcome1440 = at('LongWelcome', 'desktop1440');

/** Classic still follows the visitor's light/dark setting in PR H. */
export const FirstVisitDark390 = {
  ...at('FirstVisit', 'phone390'),
  globals: { viewport: { value: 'phone390' }, theme: 'dark' },
};
export const ContributedDark1440 = {
  ...at('Contributed', 'desktop1440'),
  globals: { viewport: { value: 'desktop1440' }, theme: 'dark' },
};
