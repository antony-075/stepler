import type {
  GuestPageEditor,
  GuestPageVersion,
  SaveGuestPageDraftRequest,
} from '@stepler/contracts';
import type { TemplateDefinition } from '@stepler/templates/core';
import { definitionOf } from '@stepler/templates/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { guestPageVersionSchema } from '@stepler/contracts';
import { Autosaver } from './autosave';
import {
  editorReducer,
  editorStatus,
  initialEditorState,
  previewPage,
  type EditorState,
} from './editor-state';

const classic = definitionOf('classic')!;
const IMAGE = {
  status: 'READY',
  thumbnailUrl: 'https://s.test/t.webp',
  previewUrl: 'https://s.test/p.webp',
  largeUrl: null,
  width: 4000,
  height: 3000,
} as const;

const version = (patch: Partial<GuestPageVersion> = {}): GuestPageVersion => ({
  templateId: 'classic',
  templateVersion: 1,
  settings: classic.defaults,
  welcomeMessage: null,
  cover: null,
  background: null,
  updatedAt: '2026-10-05T10:00:00.000Z',
  ...patch,
});
const publishedOnly: GuestPageEditor = { published: version(), draft: null };
const withDraft = (revision: number, patch: Partial<GuestPageVersion> = {}): GuestPageEditor => ({
  published: version(),
  draft: { ...version(patch), revision },
});

/** A second template for the switch: dark, its own accent, only `round` corners. */
const fake: TemplateDefinition = {
  ...classic,
  id: 'fake',
  version: 3,
  defaults: { ...classic.defaults, accent: '#C5F04A', corners: 'round' },
  options: { ...classic.options, corners: ['round'] },
};
const lookup = (id: string) => (id === 'fake' ? fake : id === 'classic' ? classic : undefined);
const reduce = (state: EditorState, action: Parameters<typeof editorReducer>[1]) =>
  editorReducer(state, action, lookup);

describe('editorReducer', () => {
  it('switching template resets the accent, keeps align when allowed, forces what is locked', () => {
    let state = initialEditorState(publishedOnly);
    state = reduce(state, { type: 'settings', patch: { accent: '#5A4A8C', align: 'center' } });
    state = reduce(state, { type: 'template', id: 'fake' });
    expect(state.working.templateId).toBe('fake');
    expect(state.working.settings).toMatchObject({
      accent: '#C5F04A',
      align: 'center',
      corners: 'round',
    });
    expect(state.pending).toBe(true);
    // An unknown template, or the same one, changes nothing.
    expect(reduce(state, { type: 'template', id: 'gone' })).toBe(state);
    expect(reduce(state, { type: 'template', id: 'fake' })).toBe(state);
  });

  it('a server answer rebases the working copy only when nothing is pending', () => {
    const idle = reduce(initialEditorState(publishedOnly), {
      type: 'server',
      editor: withDraft(2, { welcomeMessage: 'Вітаємо!' }),
    });
    expect(idle.working.welcomeMessage).toBe('Вітаємо!');
    const editing = reduce(initialEditorState(publishedOnly), { type: 'welcome', value: 'Моє' });
    const after = reduce(editing, {
      type: 'server',
      editor: withDraft(2, { welcomeMessage: 'X' }),
    });
    expect(after.working.welcomeMessage).toBe('Моє');
    expect(after.editor.draft?.revision).toBe(2);
  });

  it('a save answer ends pending only if nothing changed since it was sent', () => {
    const one = reduce(initialEditorState(publishedOnly), { type: 'welcome', value: 'a' });
    const two = reduce(one, { type: 'welcome', value: 'ab' });
    const stale = reduce(two, { type: 'saved', editor: withDraft(2), version: one.version });
    expect(stale.pending).toBe(true);
    const fresh = reduce(two, { type: 'saved', editor: withDraft(3), version: two.version });
    expect(fresh.pending).toBe(false);
  });
});

describe('editorStatus', () => {
  const idle = { inFlight: false, failure: null };
  it('published only → saved; a local change or a server draft → draft', () => {
    expect(editorStatus(initialEditorState(publishedOnly), idle)).toBe('saved');
    expect(editorStatus(initialEditorState(withDraft(2)), idle)).toBe('draft');
    const changed = reduce(initialEditorState(publishedOnly), { type: 'welcome', value: 'x' });
    expect(editorStatus(changed, idle)).toBe('draft');
  });

  it('in flight → saving; a 409 → conflict; another failure → error', () => {
    const state = initialEditorState(publishedOnly);
    expect(editorStatus(state, { inFlight: true, failure: null })).toBe('saving');
    expect(editorStatus(state, { inFlight: true, failure: 'conflict' })).toBe('conflict');
    expect(editorStatus(state, { inFlight: false, failure: 'error' })).toBe('error');
  });
});

describe('previewPage', () => {
  it('the working copy over the server draft’s images', () => {
    let state = initialEditorState(withDraft(2, { cover: IMAGE }));
    state = reduce(state, { type: 'settings', patch: { accent: '#2C7350' } });
    state = reduce(state, { type: 'welcome', value: 'Привіт' });
    expect(previewPage(state, lookup)).toMatchObject({
      cover: IMAGE,
      settings: { accent: '#2C7350' },
      welcomeMessage: 'Привіт',
    });
    state = reduce(state, { type: 'template', id: 'fake' });
    expect(previewPage(state, lookup)).toMatchObject({ templateId: 'fake', templateVersion: 3 });
  });

  it('is a page the preview message accepts: the draft’s revision is left out', () => {
    const page = previewPage(initialEditorState(withDraft(2, { cover: IMAGE })), lookup);
    expect(page).not.toHaveProperty('revision');
    expect(guestPageVersionSchema.safeParse(page).success).toBe(true);
  });
});

describe('Autosaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const working = (welcome: string) => ({
    templateId: 'classic',
    settings: classic.defaults,
    welcomeMessage: welcome,
  });

  /**
   * As the hook wires it: the snapshot only follows local changes (the hook sets it from an
   * effect, after a render); the revision comes from each answer, inside the saver.
   */
  function setup(send: (b: SaveGuestPageDraftRequest) => Promise<GuestPageEditor>) {
    let version = 0;
    const saved: number[] = [];
    const states: { inFlight: boolean; failure: string | null }[] = [];
    const sender = vi.fn(send);
    const saver = new Autosaver({
      send: sender,
      initialBaseRevision: null,
      onSaved: (_editor, v) => saved.push(v),
      onState: (state) => states.push(state),
    });
    return {
      saver,
      sender,
      saved,
      states,
      change: (welcome: string) => {
        version += 1;
        saver.setSnapshot({ working: working(welcome), version });
        saver.schedule();
      },
    };
  }

  it('waits 800 ms after the last change and sends the latest, one request at a time', async () => {
    let resolve: (editor: GuestPageEditor) => void = () => {};
    const s = setup(() => new Promise((r) => (resolve = r)));
    s.change('a');
    await vi.advanceTimersByTimeAsync(500);
    s.change('ab');
    await vi.advanceTimersByTimeAsync(799);
    expect(s.sender).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.sender).toHaveBeenCalledTimes(1);
    expect(s.sender.mock.calls[0]?.[0]).toMatchObject({ welcomeMessage: 'ab', baseRevision: null });
    // A change while in flight waits for it, then sends with the revision that came back.
    s.change('abc');
    await vi.advanceTimersByTimeAsync(800);
    expect(s.sender).toHaveBeenCalledTimes(1);
    resolve(withDraft(2));
    await vi.advanceTimersByTimeAsync(0);
    expect(s.sender).toHaveBeenCalledTimes(2);
    expect(s.sender.mock.calls[1]?.[0]).toMatchObject({ welcomeMessage: 'abc', baseRevision: 2 });
  });

  it('Review Focus 2: a 409 is never sent again; later changes are not sent either', async () => {
    const s = setup(() => Promise.reject(new ApiError('GUEST_PAGE_DRAFT_CONFLICT', 409)));
    s.change('a');
    await vi.advanceTimersByTimeAsync(800);
    expect(s.saver.state.failure).toBe('conflict');
    s.change('ab');
    await vi.advanceTimersByTimeAsync(5000);
    await expect(s.saver.flush()).rejects.toThrow('conflict');
    expect(s.sender).toHaveBeenCalledTimes(1);
  });

  it('another failure is an error that a retry clears', async () => {
    let fail = true;
    const s = setup(() =>
      fail ? Promise.reject(new ApiError('INTERNAL', 500)) : Promise.resolve(withDraft(2)),
    );
    s.change('a');
    await vi.advanceTimersByTimeAsync(800);
    expect(s.saver.state.failure).toBe('error');
    fail = false;
    s.saver.clearFailure();
    await s.saver.flush();
    expect(s.saver.state).toEqual({ inFlight: false, failure: null });
    expect(s.saved).toEqual([1]);
  });
});
