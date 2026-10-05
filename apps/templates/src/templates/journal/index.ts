import type { GuestTemplate } from '../../react/model.ts';
import { journal as definition } from './definition.ts';
import { JournalLayout } from './layout.tsx';
import { JournalThumbnail } from './thumbnail.tsx';

export const journal: GuestTemplate = {
  ...definition,
  Layout: JournalLayout,
  Thumbnail: JournalThumbnail,
};
