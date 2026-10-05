import type { GuestTemplate } from '../../react/model.ts';
import { fullscreen as definition } from './definition.ts';
import { FullscreenLayout } from './layout.tsx';
import { FullscreenThumbnail } from './thumbnail.tsx';

export const fullscreen: GuestTemplate = {
  ...definition,
  Layout: FullscreenLayout,
  Thumbnail: FullscreenThumbnail,
};
