import type { GuestContext, GuestLinkPermissions } from '@stepler/contracts';
import type { GuestPageModel, GuestView, TemplateActions } from '@stepler/templates/react';
import { primaryContribution, uploadLabelKey, type UploadLabelKey } from './contribute-actions';
import { backgroundImage, coverImage } from './guest-cover';

// What apps/web hands a guest page template (ADR 0017): the page as data. Strings arrive
// translated; the template only places them.

/**
 * The page model from the guest context. `view`: the tab the guest is on («Додати» / «Кадри»).
 * `onCoverError` asks for fresh presigned links once the images' expire.
 */
export function buildGuestPageModel(
  context: GuestContext,
  opts: {
    countsLabel: string | null;
    lastAddedLabel: string | null;
    view: GuestView;
    onCoverError?: () => void;
  },
): GuestPageModel {
  const { collection, page } = context;
  return {
    title: collection.title,
    description: collection.description,
    welcomeMessage: page.welcomeMessage,
    countsLabel: opts.countsLabel,
    lastAddedLabel: opts.lastAddedLabel,
    cover: coverImage(page.cover, opts.onCoverError),
    // Only an image background shows it (GuestTemplateRoot decides from the settings).
    background: backgroundImage(page.background, opts.onCoverError),
    view: opts.view,
  };
}

export type ActionLabelKey = UploadLabelKey | 'writeWish';

/**
 * The guest's actions (DESIGN-SYSTEM.md §6.1): files when the link takes any, with the wish as
 * the quieter second action when it takes texts too; the wish alone on a text-only link;
 * nothing on a view-only one. Uploads speak in their own sheet, so the actions carry no note.
 */
export function buildGuestActions(
  permissions: GuestLinkPermissions,
  labels: { t: (key: ActionLabelKey) => string },
  handlers: { onFiles: () => void; onWrite: () => void },
): TemplateActions | null {
  const primary = primaryContribution(permissions);
  if (primary === null) return null;
  const { t } = labels;
  if (primary === 'text') {
    return {
      primary: { label: t('writeWish'), icon: 'text', onSelect: handlers.onWrite },
      secondary: null,
      note: null,
    };
  }
  return {
    primary: {
      label: t(uploadLabelKey(permissions)),
      icon: 'files',
      onSelect: handlers.onFiles,
    },
    secondary: permissions.canSubmitText
      ? { label: t('writeWish'), onSelect: handlers.onWrite }
      : null,
    note: null,
  };
}
