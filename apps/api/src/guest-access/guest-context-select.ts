import { IMAGE_SELECT, type ImageRow } from '../images/image-urls.js';

/** What the guest context reads of the collection: its published guest page, never the draft. */
export const CONTEXT_COLLECTION = {
  id: true,
  title: true,
  description: true,
  guestPageVersions: {
    where: { state: 'PUBLISHED' },
    select: {
      templateId: true,
      templateVersion: true,
      settings: true,
      welcomeMessage: true,
      coverImage: { select: IMAGE_SELECT },
      backgroundImage: { select: IMAGE_SELECT },
    },
    take: 1,
  },
} as const;

export interface ContextCollection {
  id: string;
  title: string;
  description: string | null;
  guestPageVersions: {
    templateId: string;
    templateVersion: number;
    settings: unknown;
    welcomeMessage: string | null;
    coverImage: ImageRow | null;
    backgroundImage: ImageRow | null;
  }[];
}
