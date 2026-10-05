'use client';

import { AccentSection } from './accent-section';
import { BackgroundSection } from './background-section';
import { FontSection } from './font-section';
import { LayoutSection } from './layout-section';
import type { SectionProps } from './section-props';
import { TemplateSection } from './template-section';
import { WelcomeSection } from './welcome-section';

/**
 * The panel's sections, in the order of Appendix B: what a guest meets first, then the look. The
 * cover image lives in «Розташування» with its placement (owner remark 89).
 */
export const SECTION_IDS = [
  'template',
  'welcome',
  'background',
  'accent',
  'font',
  'layout',
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export function SectionBody({ id, ...props }: SectionProps & { id: SectionId }) {
  switch (id) {
    case 'template':
      return <TemplateSection {...props} />;
    case 'welcome':
      // Starts over when the working copy is replaced (a reset, the latest version).
      return <WelcomeSection key={props.editor.generation} {...props} />;
    case 'background':
      return <BackgroundSection {...props} />;
    case 'accent':
      return <AccentSection key={props.editor.generation} {...props} />;
    case 'font':
      return <FontSection {...props} />;
    case 'layout':
      return <LayoutSection {...props} />;
  }
}
