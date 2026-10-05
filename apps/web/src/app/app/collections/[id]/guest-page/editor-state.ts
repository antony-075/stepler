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
  /** Local changes not yet saved; `version` counts them, so an answer knows if it is stale. */
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
  | { type: 'reset'; editor: GuestPageEditor };

type Lookup = (id: string) => TemplateDefinition | undefined;

/** The version the editor works on: the draft when there is one, else the published one. */
export function currentVersion(editor: GuestPageEditor): GuestPageVersion {
  return editor.draft ?? editor.published;
}

export function workingOf(editor: GuestPageEditor): EditorWorking {
  const { templateId, settings, welcomeMessage } = currentVersion(editor);
  return { templateId, settings, welcomeMessage };
}

export function initialEditorState(editor: GuestPageEditor): EditorState {
  return { editor, working: workingOf(editor), pending: false, version: 0, generation: 0 };
}

function changed(state: EditorState, working: EditorWorking): EditorState {
  return { ...state, working, pending: true, version: state.version + 1 };
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
    case 'server':
      return state.pending
        ? { ...state, editor: action.editor }
        : {
            ...state,
            editor: action.editor,
            working: workingOf(action.editor),
            generation: state.generation + 1,
          };
    case 'saved':
      return action.version === state.version
        ? { ...state, editor: action.editor, pending: false }
        : { ...state, editor: action.editor };
    case 'reset':
      return {
        ...initialEditorState(action.editor),
        version: state.version + 1,
        generation: state.generation + 1,
      };
  }
}

export type EditorStatus = 'saved' | 'draft' | 'saving' | 'error' | 'conflict';

/** The save bar's line: a conflict or an error first, then a request in flight, then the draft. */
export function editorStatus(
  state: Pick<EditorState, 'editor' | 'pending'>,
  request: { inFlight: boolean; failure: 'error' | 'conflict' | null },
): EditorStatus {
  if (request.failure !== null) return request.failure;
  if (request.inFlight) return 'saving';
  if (state.pending || state.editor.draft !== null) return 'draft';
  return 'saved';
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
