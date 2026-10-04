import type { GuestTemplate } from '../../react/model.js';
import { classic as definition } from './definition.js';
import { ClassicLayout } from './layout.js';
import { ClassicThumbnail } from './thumbnail.js';

export const classic: GuestTemplate = {
  ...definition,
  Layout: ClassicLayout,
  Thumbnail: ClassicThumbnail,
  followsSystemScheme: true,
};
