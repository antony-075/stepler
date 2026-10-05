import type { Meta } from '@storybook/react-vite';
import { matrixStory, storyAt, TemplateStory } from '../../fixtures/stories.tsx';

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
export const ImageBackground360 = at('ImageBackground', 'phone360');
export const ImageBackground390 = at('ImageBackground', 'phone390');
export const ImageBackground768 = at('ImageBackground', 'tablet768');
export const ImageBackground1440 = at('ImageBackground', 'desktop1440');
export const EmptyFrames360 = at('EmptyFrames', 'phone360');
export const EmptyFrames390 = at('EmptyFrames', 'phone390');
export const EmptyFrames768 = at('EmptyFrames', 'tablet768');
export const EmptyFrames1440 = at('EmptyFrames', 'desktop1440');
export const LongUkrainianTitle360 = at('LongUkrainianTitle', 'phone360');
export const LongUkrainianTitle390 = at('LongUkrainianTitle', 'phone390');
export const LongUkrainianTitle768 = at('LongUkrainianTitle', 'tablet768');
export const LongUkrainianTitle1440 = at('LongUkrainianTitle', 'desktop1440');
export const ManyFrames360 = at('ManyFrames', 'phone360');
export const ManyFrames390 = at('ManyFrames', 'phone390');
export const ManyFrames768 = at('ManyFrames', 'tablet768');
export const ManyFrames1440 = at('ManyFrames', 'desktop1440');

/** Left / centre × sharp / soft / round (owner remark 111). */
export const AlignCornersMatrix = matrixStory('classic');
