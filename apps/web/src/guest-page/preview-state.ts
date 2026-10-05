import { z } from 'zod';

// Which guest page the editor's preview draws (owner remarks 77, 92): two separate questions,
// each a short list. «Доступ за посиланням» is what the link lets the guest do; «Вміст» is what
// is on the page. Some pairs cannot happen (others' frames on a link that hides them, a guest's
// own uploads on a view-only link, any content on a paused or closed link): those content
// options are refused with a reason, and a refused pair is never drawn.

export const PREVIEW_ACCESS = ['all', 'own', 'view', 'paused', 'closed'] as const;
export type PreviewAccess = (typeof PREVIEW_ACCESS)[number];

export const PREVIEW_CONTENT = ['empty', 'mine', 'others', 'both', 'uploading'] as const;
export type PreviewContent = (typeof PREVIEW_CONTENT)[number];

export const previewStateSchema = z
  .object({ access: z.enum(PREVIEW_ACCESS), content: z.enum(PREVIEW_CONTENT) })
  .strict();
export type PreviewState = z.infer<typeof previewStateSchema>;

/** «Бачать усе» + «Мої й чужі». */
export const DEFAULT_PREVIEW_STATE: PreviewState = { access: 'all', content: 'both' };

/** Why a content option cannot go with an access, or `null` when it can. */
export type ContentRefusal = 'hidden-gallery' | 'view-only' | 'stopped';

export function contentRefusal(
  access: PreviewAccess,
  content: PreviewContent,
): ContentRefusal | null {
  if (access === 'paused' || access === 'closed') return content === 'empty' ? null : 'stopped';
  if (access === 'view') {
    return content === 'empty' || content === 'others' ? null : 'view-only';
  }
  if (access === 'own') {
    return content === 'others' || content === 'both' ? 'hidden-gallery' : null;
  }
  return null;
}

/** The content each access falls back to when the current one cannot go with it. */
const FALLBACK: Record<PreviewAccess, PreviewContent> = {
  all: 'both',
  own: 'mine',
  view: 'others',
  paused: 'empty',
  closed: 'empty',
};

/** A new access, keeping the content when it still makes sense. */
export function withAccess(state: PreviewState, access: PreviewAccess): PreviewState {
  return {
    access,
    content: contentRefusal(access, state.content) === null ? state.content : FALLBACK[access],
  };
}

/** What the page shows for a state (a refused pair is drawn as the access's fallback). */
export type PreviewShape =
  | { kind: 'link-state'; state: 'paused' | 'closed' }
  | {
      kind: 'page';
      own: 'none' | 'empty' | 'items' | 'uploading';
      all: 'none' | 'empty' | 'own' | 'others' | 'both';
      actions: boolean;
    };

export function previewShape(state: PreviewState): PreviewShape {
  const { access } = state;
  if (access === 'paused' || access === 'closed') return { kind: 'link-state', state: access };
  const content = contentRefusal(access, state.content) === null ? state.content : FALLBACK[access];
  const own =
    access === 'view'
      ? 'none'
      : content === 'mine' || content === 'both'
        ? 'items'
        : content === 'uploading'
          ? 'uploading'
          : 'empty';
  const all =
    access === 'own'
      ? 'none'
      : content === 'empty'
        ? 'empty'
        : content === 'mine'
          ? 'own'
          : content === 'others'
            ? 'others'
            : 'both';
  return { kind: 'page', own, all, actions: access !== 'view' };
}
