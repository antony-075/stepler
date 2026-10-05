import type { GuestTemplate } from '../../react/model.ts';
import { minimal as definition } from './definition.ts';
import { MinimalLayout } from './layout.tsx';
import { MinimalThumbnail } from './thumbnail.tsx';

export const minimal: GuestTemplate = {
  ...definition,
  Layout: MinimalLayout,
  Thumbnail: MinimalThumbnail,
};
