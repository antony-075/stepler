import type { GuestTemplate } from '../../react/model.ts';
import { party as definition } from './definition.ts';
import { PartyLayout } from './layout.tsx';
import { PartyThumbnail } from './thumbnail.tsx';

export const party: GuestTemplate = {
  ...definition,
  Layout: PartyLayout,
  Thumbnail: PartyThumbnail,
};
