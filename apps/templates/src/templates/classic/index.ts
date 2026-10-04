import type { GuestTemplate } from '../../react/model.ts';
import { classic as definition } from './definition.ts';
import { ClassicLayout } from './layout.tsx';
import { ClassicThumbnail } from './thumbnail.tsx';

export const classic: GuestTemplate = {
  ...definition,
  Layout: ClassicLayout,
  Thumbnail: ClassicThumbnail,
  followsSystemScheme: true,
};
