import type { GuestContext, GuestLinkPermissions } from '@stepler/contracts';
import { describe, expect, it, vi } from 'vitest';
import { buildGuestActions, buildGuestPageModel, type ActionLabelKey } from './template-model';

const none: GuestLinkPermissions = {
  canUploadPhotos: false,
  canUploadVideos: false,
  canUploadDocuments: false,
  canSubmitText: false,
  canViewGallery: false,
  canDeleteOwn: false,
};

const LABELS: Record<ActionLabelKey, string> = {
  addPhotosVideos: 'Додати фото й відео',
  addPhotos: 'Додати фото',
  addVideos: 'Додати відео',
  addDocuments: 'Додати документи',
  addMore: 'Додати ще',
  writeWish: 'Написати побажання',
};
const t = (key: ActionLabelKey) => LABELS[key];

const handlers = () => ({ onFiles: vi.fn(), onWrite: vi.fn() });

describe('buildGuestActions', () => {
  it('a view-only link has no actions', () => {
    expect(
      buildGuestActions(
        { ...none, canViewGallery: true },
        { t, batchStarted: false },
        handlers(),
        null,
      ),
    ).toBeNull();
  });

  it('a text-only link makes the wish the primary action, with no secondary', () => {
    const h = handlers();
    const actions = buildGuestActions(
      { ...none, canSubmitText: true },
      { t, batchStarted: false },
      h,
      null,
    );
    expect(actions).toEqual({
      primary: { label: 'Написати побажання', icon: 'text', onSelect: h.onWrite },
      secondary: null,
      note: null,
    });
  });

  it('files plus text: files first, the wish second', () => {
    const h = handlers();
    const actions = buildGuestActions(
      { ...none, canUploadPhotos: true, canUploadVideos: true, canSubmitText: true },
      { t, batchStarted: false },
      h,
      'Не закривайте сторінку',
    );
    expect(actions).toEqual({
      primary: { label: 'Додати фото й відео', icon: 'files', onSelect: h.onFiles },
      secondary: { label: 'Написати побажання', onSelect: h.onWrite },
      note: 'Не закривайте сторінку',
    });
  });

  it('files without text: no secondary; the label follows the kinds the link takes', () => {
    const actions = buildGuestActions(
      { ...none, canUploadDocuments: true },
      { t, batchStarted: false },
      handlers(),
      null,
    );
    expect(actions?.primary.label).toBe('Додати документи');
    expect(actions?.secondary).toBeNull();
  });

  it('after a batch the file action reads «Додати ще»', () => {
    const actions = buildGuestActions(
      { ...none, canUploadPhotos: true },
      { t, batchStarted: true },
      handlers(),
      null,
    );
    expect(actions?.primary.label).toBe('Додати ще');
  });
});

const COVER = {
  largeUrl: null,
  thumbnailUrl: 'https://storage.example.com/c/thumbnail.webp?X-Amz-Signature=a',
  previewUrl: 'https://storage.example.com/c/preview.webp?X-Amz-Signature=b',
  width: 4000,
  height: 3000,
};

type Fields = Partial<GuestContext['collection']> &
  Partial<Pick<GuestContext['page'], 'welcomeMessage' | 'cover'>>;

function context({ welcomeMessage = null, cover = null, ...collection }: Fields): GuestContext {
  return {
    collection: {
      id: '0192f0c4-7d2a-7c4e-9a10-0123456789ab',
      title: 'Весілля Олі та Тараса',
      description: null,
      ...collection,
    },
    page: {
      templateId: 'classic',
      templateVersion: 1,
      settings: {
        background: { kind: 'solid', color: '#F0F1EE' },
        accent: '#B83E26',
        headingFont: 'geologica',
        coverPlacement: 'top',
        align: 'start',
        corners: 'soft',
      },
      welcomeMessage,
      cover,
      background: null,
    },
    permissions: none,
    guest: { name: null, nameAnswered: false },
    limits: {
      maxFileBytes: { photo: 1, video: 1, document: 1 },
      filesPerBatch: 1,
      textMaxChars: 1,
    },
    counts: null,
    contribution: 'OPEN',
  };
}

describe('buildGuestPageModel', () => {
  it('maps the collection, the counts line and the phase', () => {
    const model = buildGuestPageModel(
      context({ description: 'Субота, 14 червня.', welcomeMessage: 'Вітаємо!' }),
      { countsLabel: '86 кадрів', lastAddedLabel: 'останній о 21:10', contributed: true },
    );
    expect(model).toEqual({
      title: 'Весілля Олі та Тараса',
      description: 'Субота, 14 червня.',
      welcomeMessage: 'Вітаємо!',
      countsLabel: '86 кадрів',
      lastAddedLabel: 'останній о 21:10',
      cover: null,
      background: null,
      phase: 'contributed',
    });
    expect(
      buildGuestPageModel(context({}), {
        countsLabel: null,
        lastAddedLabel: null,
        contributed: false,
      }).phase,
    ).toBe('first-visit');
  });

  it('the cover: the preview as src, both renditions by width, the source dimensions', () => {
    const onError = vi.fn();
    const model = buildGuestPageModel(context({ cover: COVER }), {
      countsLabel: null,
      lastAddedLabel: null,
      contributed: false,
      onCoverError: onError,
    });
    expect(model.cover).toEqual({
      src: COVER.previewUrl,
      srcSet: `${COVER.thumbnailUrl} 480w, ${COVER.previewUrl} 1600w`,
      sizes: '100vw',
      width: 4000,
      height: 3000,
      onError,
    });
  });

  it('a portrait or small cover gets the widths its renditions really have', () => {
    const portrait = buildGuestPageModel(
      context({ cover: { ...COVER, width: 3000, height: 4000 } }),
      {
        countsLabel: null,
        lastAddedLabel: null,
        contributed: false,
      },
    ).cover;
    expect(portrait?.srcSet).toBe(`${COVER.thumbnailUrl} 360w, ${COVER.previewUrl} 1200w`);
    // Smaller than the thumbnail: both renditions are the source size, so only one is offered.
    const small = buildGuestPageModel(context({ cover: { ...COVER, width: 400, height: 300 } }), {
      countsLabel: null,
      lastAddedLabel: null,
      contributed: false,
    }).cover;
    expect(small?.srcSet).toBe(`${COVER.previewUrl} 400w`);
  });

  it('a background adds its 2400 px rendition when it has one', () => {
    const LARGE = 'https://storage.example.com/b/large.webp?X-Amz-Signature=c';
    const withBackground = (largeUrl: string | null) => {
      const ctx = context({});
      return buildGuestPageModel(
        { ...ctx, page: { ...ctx.page, background: { ...COVER, largeUrl } } },
        { countsLabel: null, lastAddedLabel: null, contributed: false },
      ).background;
    };
    expect(withBackground(LARGE)?.srcSet).toBe(
      `${COVER.thumbnailUrl} 480w, ${COVER.previewUrl} 1600w, ${LARGE} 2400w`,
    );
    expect(withBackground(null)?.srcSet).toBe(
      `${COVER.thumbnailUrl} 480w, ${COVER.previewUrl} 1600w`,
    );
  });
});
