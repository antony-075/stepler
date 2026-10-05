import type { GuestTemplate } from '../../react/model.ts';
import { postcard as definition } from './definition.ts';
import { PostcardLayout } from './layout.tsx';
import { PostcardThumbnail } from './thumbnail.tsx';

export const postcard: GuestTemplate = {
  ...definition,
  Layout: PostcardLayout,
  Thumbnail: PostcardThumbnail,
};
