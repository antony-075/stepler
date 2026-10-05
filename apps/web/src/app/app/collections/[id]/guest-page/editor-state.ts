import type { GuestPageEditor, GuestPageVersion, ThemeSettings } from '@stepler/contracts';
import { applyTemplate, definitionOf, type TemplateDefinition } from '@stepler/templates/core';

// The editor's working copy and its status (plan Task 13). The server holds the published
// version and the draft; the working copy is what the panel shows, autosaved into the draft.
// Pure: the hook (`use-guest-page-editor.ts`) owns the requests.

/** What a save sends; images change through their own routes and are never part of it. */
export type EditorWorking = {
  templateId: string;
  settings: ThemeSettings;
  welcomeMessage: string | null;
};

export type EditorState = {
  /** The last editor state the server answered. */
  editor: GuestPageEditor;
  working: EditorWorking;
  /**
   * The working copy differs by value from the server's current version (the draft, else the
   * published one): there is something to autosave. `version` counts changes, so an answer
   * knows if it is stale.
   */
  pending: boolean;
  version: number;
  /** Bumped when the working copy is replaced from the server (a rebase or a reset). */
  generation: number;
};

export type EditorAction =
  | { type: 'template'; id: string }
  | { type: 'settings'; patch: Partial<ThemeSettings> }
  | { type: 'welcome'; value: string | null }
  /** A server answer; the working copy follows it only when nothing is pending locally. */
  | { type: 'server'; editor: GuestPageEditor }
  /** A save answered for `version`: pending ends if nothing changed since. */
  | { type: 'saved'; editor: GuestPageEditor; version: number }
  /** After «Скинути зміни» (or «Показати останню версію»): the server's state, nothing pending. */
  | { type: 'reset'; editor: GuestPageEditor }
  /** Undo / redo: a working copy from the history (owner remark 113). */
  | { type: 'restore'; working: EditorWorking };

type Lookup = (id: string) => TemplateDefinition | undefined;

/** The version the editor works on: the draft when there is one, else the published one. */
export function currentVersion(editor: GuestPageEditor): GuestPageVersion {
  return editor.draft ?? editor.published;
}

export function workingOf(editor: GuestPageEditor): EditorWorking {
  return workingOfVersion(currentVersion(editor));
}

export function workingOfVersion(version: GuestPageVersion): EditorWorking {
  const { templateId, settings, welcomeMessage } = version;
  return { templateId, settings, welcomeMessage };
}

/** The draft images a version points at, by id (owner remark 113). */
export type ImageIds = { cover: string | null; background: string | null };

export const imageIdsOf = (version: GuestPageVersion): ImageIds => ({
  cover: version.cover?.id ?? null,
  background: version.background?.id ?? null,
});

/** Colours as stored (upper case), the welcome trimmed and `null` when empty. */
function normalised(working: EditorWorking): EditorWorking {
  const upper = (value: string) => value.toUpperCase();
  const { settings } = working;
  const background =
    settings.background.kind === 'solid'
      ? { ...settings.background, color: upper(settings.background.color) }
      : settings.background;
  const welcome = working.welcomeMessage?.trim() ?? '';
  return {
    templateId: working.templateId,
    settings: { ...settings, accent: upper(settings.accent), background },
    welcomeMessage: welcome === '' ? null : welcome,
  };
}

/** JSON with sorted keys at every depth: equal values give equal strings. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, inner]) => inner !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${stable(inner)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Whether two working copies are the same page by value (owner remark 113): key order, colour
 * case and a welcome of only spaces do not count as changes.
 */
export function sameWorking(a: EditorWorking, b: EditorWorking): boolean {
  return stable(normalised(a)) === stable(normalised(b));
}

export const sameImages = (a: ImageIds, b: ImageIds) =>
  a.cover === b.cover && a.background === b.background;

/**
 * Something guests do not see yet: the working copy, or the draft's images, differ by value
 * from the published version. A change made and then undone by hand is not one.
 */
export function differsFromPublished(state: Pick<EditorState, 'editor' | 'working'>): boolean {
  const { published } = state.editor;
  return (
    !sameWorking(state.working, workingOfVersion(published)) ||
    !sameImages(imageIdsOf(currentVersion(state.editor)), imageIdsOf(published))
  );
}

export function initialEditorState(editor: GuestPageEditor): EditorState {
  return { editor, working: workingOf(editor), pending: false, version: 0, generation: 0 };
}

/** A new working copy: pending only while it differs from what the server has (no no-op save). */
function changed(state: EditorState, working: EditorWorking): EditorState {
  return {
    ...state,
    working,
    pending: !sameWorking(working, workingOf(state.editor)),
    version: state.version + 1,
  };
}

export function editorReducer(
  state: EditorState,
  action: EditorAction,
  lookup: Lookup = definitionOf,
): EditorState {
  switch (action.type) {
    case 'template': {
      const def = lookup(action.id);
      if (def === undefined || action.id === state.working.templateId) return state;
      return changed(state, {
        ...state.working,
        templateId: def.id,
        settings: applyTemplate(def, state.working.settings),
      });
    }
    case 'settings':
      return changed(state, {
        ...state.working,
        settings: { ...state.working.settings, ...action.patch },
      });
    case 'welcome':
      return changed(state, { ...state.working, welcomeMessage: action.value });
    case 'restore':
      // The fields holding their own text (the welcome, the hex) start over from it.
      return { ...changed(state, action.working), generation: state.generation + 1 };
    case 'server':
      return state.pending
        ? {
            ...state,
            editor: action.editor,
            pending: !sameWorking(state.working, workingOf(action.editor)),
          }
        : {
            ...state,
            editor: action.editor,
            working: workingOf(action.editor),
            generation: state.generation + 1,
          };
    case 'saved':
      return action.version === state.version
        ? { ...state, editor: action.editor, pending: false }
        : {
            ...state,
            editor: action.editor,
            pending: !sameWorking(state.working, workingOf(action.editor)),
          };
    case 'reset':
      return {
        ...initialEditorState(action.editor),
        version: state.version + 1,
        generation: state.generation + 1,
      };
  }
}

export type EditorStatus = 'saved' | 'draft' | 'saving' | 'error' | 'conflict';

/**
 * The save bar's line: a conflict or an error first, then a request in flight, then whether the
 * page differs by value from what guests see (a draft equal to it reads «Збережено»).
 */
export function editorStatus(
  state: Pick<EditorState, 'editor' | 'working'>,
  request: { inFlight: boolean; failure: 'error' | 'conflict' | null },
): EditorStatus {
  if (request.failure !== null) return request.failure;
  if (request.inFlight) return 'saving';
  return differsFromPublished(state) ? 'draft' : 'saved';
}

/**
 * What the preview shows: the working copy over the server draft's (or the published) images,
 * the template version from its definition.
 */
export function previewPage(state: EditorState, lookup: Lookup = definitionOf): GuestPageVersion {
  // The draft's `revision` is not part of a page: the preview message's schema is strict.
  const { cover, background, templateVersion, updatedAt } = currentVersion(state.editor);
  const def = lookup(state.working.templateId);
  return {
    cover,
    background,
    updatedAt,
    templateId: state.working.templateId,
    templateVersion: def?.version ?? templateVersion,
    settings: state.working.settings,
    welcomeMessage: state.working.welcomeMessage,
  };
}

/** The revision a save names: the draft's, or `null` while there is none. */
export function baseRevisionOf(editor: GuestPageEditor): number | null {
  return editor.draft?.revision ?? null;
}
